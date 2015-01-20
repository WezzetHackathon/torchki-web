var User = function(options) {
    this.id = options._id;
    this.name = options.name;
    this.email = options.email;
};

User.prototype.getMyTransactions = function(transactions) {
    return _.filter(transactions, function(item) {return item.from == this.id && item.status !== 'closed'}.bind(this));
};

User.prototype.getMyTransactionsSum = function(transactions) {
    var filtered = _.filter(transactions, function(item) {return item.from == this.id && item.status !== 'closed'}.bind(this));
    return _.reduce(_.pluck(filtered, 'amount'), function(memo, num){ return +memo + +num; }, 0);
};

User.prototype.getOurTransactions = function(transactions) {
    return _.filter(transactions, function(item) {return item.to == this.id && item.status !== 'closed'}.bind(this));
};

User.prototype.getOurTransactionsSum = function(transactions) {
    var filtered = _.filter(transactions, function(item) {return item.to == this.id && item.status !== 'closed'}.bind(this));
    return _.reduce(_.pluck(filtered, 'amount'), function(memo, num){ return +memo + +num; }, 0);
};

User.prototype.getBadges = function (transactions) {
    var debtorsCount = _.filter(this.getMyTransactions(transactions), function(item){return ['paid', 'declined', 'confirmed'].indexOf(item.status) != -1}),
        creditorsCount = _.filter(this.getOurTransactions(transactions), function(item){return ['open', 'accepted', 'notConfirmed'].indexOf(item.status) != -1});
    return {
        debtors: debtorsCount.length,
        creditors: creditorsCount.length
    }
};

var Application = function() {
    this.$container = $('#wrap');
    this.templates = {
        'login': $('#login-template'),
        'users': $('#users-template'),
        'debtors': $('#debtors-template'),
        'creditors': $('#creditors-template'),
        'profile': $('#profile-template'),
        'addTransaction': $('#addTransaction-template')
    };
    this.storage = new ApplicationStorage();
    this.me = this.storage.get('email') || null;
    this.users = {};
    this.transactionsList = [];
    this.states = {
        'open': 'открыта',
        'accepted': 'подтверждена',
        'declined': 'отклонена',
        'paid': 'оплачена',
        'confirmed': 'подтверждена',
        'notConfirmed': 'не подтверждена',
        'closed': 'закрыта'
    };
    this.debtorsStates = {
        'open': 'ожидание подтверждения',
        'accepted': 'подтверждена',
        'declined': 'отклонена',
        'paid': 'оплачена',
        'confirmed': 'подтверждена',
        'notConfirmed': 'не подтверждена',
        'closed': 'закрыта'
    };
    this.creditorsStates = {
        'open': 'новая запись',
        'accepted': 'подтверждена',
        'declined': 'отклонена',
        'paid': 'оплачена',
        'confirmed': 'подтверждена',
        'notConfirmed': 'не подтверждена, повторите',
        'closed': 'закрыта'
    };
    this.badges = {
        debtors: 0,
        creditors: 0
    };
    this.currentPage = null;
    this.timer = null;
};

Application.prototype.init = function (callback) {
    this.call({}, 'getUsersList', function(users) {
        for (var i in users)
            if (users.hasOwnProperty(i))
                this.users[users[i].email] = new User(users[i]);

        if (this.me) this.updateTransactionsList();
        (typeof callback == 'function') && callback();
    }.bind(this));

    var _this = this;
    $('body')
        // события входа
        .delegate('#sign-in-form', 'submit', function (e) {
            e.preventDefault();
            var email = $(this).find('[type=email]').val();
            if (_this.checkUser(email)) {
                _this.me = email;
                _this.storage.set('email', _this.me);
                _this.updateTransactionsList(function() {
                    _this.showPage('users');
                });
            }
            else
                alert('Пользователь не найден');
            return false;
        })
        // события ссылок в меню
        .delegate('#navbar-links a', 'click', function(e){
            var elem = $(e.currentTarget);
            e.preventDefault();
            $('.navbar-collapse').collapse('toggle');
            var lockedPages = ['users', 'debtors', 'creditors', 'profile'];
            if (lockedPages.indexOf(elem.attr('data-page')) > -1 && !_this.me)
                alert('Авторизуйтесь, чтобы перейти к этой странице');
            else
                _this.showPage(elem.attr('data-page'));
        })
        // события выхода
        .delegate('#logout-btn', 'click', function(e){
            e.preventDefault();
            _this.me = null;
            _this.storage.remove('email');
            _this.showPage('login');
        })
        // события выбора участника для передачи средств
        .delegate('.user-item', 'click', function(e){
            e.preventDefault();
            if (!_this.me) {
                alert('Войдите под своим именем, чтобы дать в долг');
                return;
            }
            _this.showPage('addTransaction', {
                from: _this.getMe(),
                to: _this.getUserById($(e.currentTarget).attr('data-id'))
            });
        })
        // события передачи средств
        .delegate('#addTransaction-form', 'submit', function(e){
            e.preventDefault();
            var elem = $(e.currentTarget),
                data = {
                    from: elem.find('input[name=from]').val(),
                    to: elem.find('input[name=to]').val(),
                    amount: elem.find('input[name=sum]').val()
                };
            _this.call(data, 'addTransaction', function(result) {
                var user = _this.getUserById(data.to);
                alert('Записан долг в размере '+data.amount+' руб. участнику '+user.name);
                _this.showPage('users');
            });
        })
        .delegate('.js-change-state', 'click', function(e){
            e.preventDefault();
            var elem = $(e.currentTarget),
                data = {
                    id: elem.attr('data-id'),
                    state: elem.attr('data-new-state')
                };
            elem.attr('disabled', true);
            _this.call(data, 'changeTransactionState', function(result) {
                this.updateTransactionsList(function() {
                    this.showPage(this.currentPage);
                }.bind(this));
            }.bind(this));
        }.bind(this));
};

Application.prototype.getMe = function() {
    return this.getUserByEmail(this.me);
};

Application.prototype.showPage = function(page, data) {
    this.currentPage = page;
    data = data || {};
    switch (page) {
        case 'login':
            data = {
                me: this.getMe()
            };
            break;
        case 'users':
            data = this.users;
            break;
        case 'debtors':
            data = {
                items: _.filter(this.transactionsList, function(item) {return item.from == this.getMe().id}.bind(this)),
                me: this.getMe(),
                getUserById: this.getUserById.bind(this),
                states: this.debtorsStates,
                users: this.users
            };
            break;
        case 'creditors':
            data = {
                items: _.filter(this.transactionsList, function(item) {return item.to == this.getMe().id}.bind(this)),
                me: this.getMe(),
                getUserById: this.getUserById.bind(this),
                states: this.creditorsStates,
                users: this.users
            };
            break;
        case 'profile':
            data = {
                me: this.getMe(),
                my: this.getMe().getMyTransactionsSum(this.transactionsList),
                our: this.getMe().getOurTransactionsSum(this.transactionsList)
            };
            break;
    }
    this.render(page, data);
};

Application.prototype.render = function (template, data) {
    var compiledTemplate = _.template(this.templates[template].text())({data: data});
    this.$container.html(compiledTemplate);
};

Application.prototype.checkUser = function (email) {
    if (!email) return false;
    return this.users.hasOwnProperty(email);
};

Application.prototype.getUserById = function(id) {
    for (var i in this.users) {
        if (this.users.hasOwnProperty(i))
            if (this.users[i].id == id) return this.users[i];
    }
};

Application.prototype.getUserByEmail = function(email) {
    return this.users[email];
};

Application.prototype.getTransactionsList = function(userId, callback) {
    this.call(userId, 'getTransactionsList', function(result) {
        callback && callback(result);
    });
};

Application.prototype.updateTransactionsList = function (callback) {
    clearTimeout(this.timer);
    if (!this.me) return false;
    this.getTransactionsList(this.getMe().id, function(data) {
        this.transactionsList = data;
        this.badges = this.getMe().getBadges(this.transactionsList);
        this.renderBadges(this.badges);
        this.timer = setTimeout(this.updateTransactionsList.bind(this), 3000);
        callback && callback(data);
    }.bind(this));
};

Application.prototype.renderBadges = function() {
    $('#badge-debtors').html(this.badges.debtors && this.badges.debtors || '');
    $('#badge-creditors').html(this.badges.creditors && this.badges.creditors || '');
};

Application.prototype.call = function (data, method, callback) {
    var requestData = {
        "jsonrpc": "2.0",
        "method": method,
        "params": data || {},
        "id": 1
    };
    $.post('http://tls.vm-dev24:8082', JSON.stringify(requestData), function(data){
        callback(data.result);
    }.bind(this));
};

var ApplicationStorage = function () {};

ApplicationStorage.prototype.isSupported = function() {
    try {
        return 'localStorage' in window && window['localStorage'] !== null;
    } catch (e) {
        return false;
    }
};

ApplicationStorage.prototype.set = function(key, data) {
    if (!this.isSupported()) return;
    localStorage.setItem(key, JSON.stringify(data));
};

ApplicationStorage.prototype.get = function(key) {
    if (!this.isSupported()) return;
    return JSON.parse(localStorage.getItem(key));
};

ApplicationStorage.prototype.remove = function(key) {
    if (!this.isSupported()) return;
    return localStorage.removeItem(key);
};