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
    this.me = this.storage.get('me') || null;
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
    this.currentPage = null;
    this.timer = null;

    if (this.me) this.updateTransactionsList();
};

Application.prototype.init = function (callback) {
    this.call({}, 'getUsersList', function(users) {
        for (var i in users)
            if (users.hasOwnProperty(i))
                this.users[users[i].email] = new User(users[i]);

        (typeof callback == 'function') && callback();
    }.bind(this));

    var _this = this;
    $('body')
        // события входа
        .delegate('#sign-in-form', 'submit', function (e) {
            e.preventDefault();
            var email = $(this).find('[type=email]').val();
            if (_this.checkUser(email)) {
                _this.me = _this.users[email];
                _this.storage.set('me', _this.me);
                _this.updateTransactionsList();
                _this.showPage('users');
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
            _this.storage.remove('me');
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
                from: _this.me,
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
                if (result._id)
                    alert('Записан долг в размере '+data.amount+' руб. участнику '+user.name);
                else
                    alert('Кажется, что-то пошло не так... Повторите позже.');
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

Application.prototype.showPage = function(page, data) {
    this.currentPage = page;
    data = data || {};
    switch (page) {
        case 'login':
            data = {
                me: this.me
            };
            break;
        case 'users':
            data = this.users;
            break;
        case 'debtors':
            data = {
                items: _.filter(this.transactionsList, function(item) {return item.from == this.me.id}.bind(this)),
                me: this.me,
                getUserById: this.getUserById.bind(this),
                states: this.debtorsStates,
                users: this.users
            };
            break;
        case 'creditors':
            data = {
                items: _.filter(this.transactionsList, function(item) {return item.to == this.me.id}.bind(this)),
                me: this.me,
                getUserById: this.getUserById.bind(this),
                states: this.creditorsStates,
                users: this.users
            };
            break;
        case 'profile':
            data = {
                me: this.me,
                my: (function(){
                    var transactions = _.filter(this.transactionsList, function(item) {return item.from == this.me.id && item.status !== 'closed'}.bind(this));
                    return _.reduce(_.pluck(transactions, 'amount'), function(memo, num){ return +memo + +num; }, 0);
                }.bind(this))(),
                our: (function(){
                    var transactions = _.filter(this.transactionsList, function(item) {return item.to == this.me.id && item.status !== 'closed'}.bind(this));
                    return _.reduce(_.pluck(transactions, 'amount'), function(memo, num){ return +memo + +num; }, 0);
                }.bind(this))()
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
    this.getTransactionsList(this.me.id, function(data) {
        this.transactionsList = data;
        this.timer = setTimeout(this.updateTransactionsList.bind(this), 3000);
        callback && callback(data);
    }.bind(this));
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

var User = function(options) {
    this.id = options._id;
    this.name = options.name;
    this.email = options.email;
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