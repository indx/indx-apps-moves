    
// test
var nodeindx = require('../../lib/services/nodejs/nodeindx'),
    nodeservice = require('../../lib/services/nodejs/service'),
    u = nodeindx.utils,
    _ = require('underscore')
    jQuery = require('jquery'),
    path = require('path'),
    https = require('https'),
    output = nodeservice.output,
    angular = require('angular'),
    entities = nodeindx.injector.get('entities');

var MovesService = Object.create(nodeservice.NodeService, {
    run: { 
        // master run 
        value: function(store) {
            // run continuously
            var this_ = this;
            this.store = store;

            var doinit = function() {
                console.log('doinit() -- ', config);
                this_._loadBox().then(function() { this_._update(); }).fail(function(er) { 
                    console.error('Error in _init ', er); 
                    process.exit(-1); 
                });
            };

            // checkauthcode
            if (config.authcode) {
                // can only be used once, so that means we need to get it
                var code = config.authcode;
                this_.debug('Getting access token from authcode > ', code);
                this_.getAccessToken().then(function(authtokens) {
                    delete config.authcode;
                    console.error('positive cont ');
                    _(config).extend(authtokens);
                    this_.save_config(config).then(doinit).fail(function() { 
                        console.error('error saving authtokens ', config); 
                        process.exit(-1);
                    });
                }).fail(function(err) { 
                    console.error('error getting authtokens', err);
                    this_.debug('deleting authcode >> done.');
                    delete config.authcode;
                    this_.save_config(config).then(function() { process.exit(-1); });
                });
            } else if (config.access_token) {
                console.log('we have an access code, boyzz - init');
                doinit();
            }
        }
    },
    _update: {
        value:function(box,diary){
            // if (!this.tokenset) {
            //     this.getAccessToken().then(function(tokenset) {
            //         console.log('yup got token ', tokenset);
            //         this_.tokenset = tokenset;
            //     });
            // }
        }
    },
    getAccessToken: {
        value:function() {            
            var d = u.deferred(), this_ = this;
            var base_url = 'https://api.moves-app.com/oauth/v1/access_token';
            var params = {
                grant_type: 'authorization_code',
                code:this_.config.authcode,
                client_id:this_.config.clientid,
                client_secret:this_.config.clientsecret,
                redirect_uri:[this_.store._getBaseURL(), "apps", "moves", "moves_redirect.html"].join('/')
            };
            console.log('REDIRECT >>> ', params.redirect_uri);
            console.log("CODE >> ", params.code);
            var url = base_url +"?"+jQuery.param(params);
            jQuery.post(url).then(function(result) {
                console.log('success >> ', result, typeof result);
                d.resolve(result);
            }).fail(function(bail) { 
                console.error('error >> ', bail);
                d.reject(bail);
            });
            return d.promise();
        }
    },
    checkAccessToken: {
        value:function() {            
            var d = u.deferred(), this_ = this;
            var base_url = 'https://api.moves-app.com/oauth/v1/tokeninfo';
            var params = {
                access_token:this_.config.access_token,
            };
            var url = base_url +"?"+jQuery.param(params);
            jQuery.get(url).then(function(result) {
                // token is valid
                console.info('token valid >> ', result);
                d.resolve(result);
            }).fail(function(bail) { 
                // token isn't valid anymore
                console.error('error >> ', bail);
                d.reject(bail);
            });
            return d.promise();
        }
    },
    refreshToken: {
        value:function() {            
            var d = u.deferred(), this_ = this;
            var base_url = 'https://api.moves-app.com/oauth/v1/access_token';
            var params = {
                grant_type: 'refresh_token',
                refresh_token:this_.config.refresh_token,
                client_id:this_.config.clientid,
                client_secret:this_.config.clientsecret
            };
            var url = base_url +"?"+jQuery.param(params);
            jQuery.post(url).then(function(result) {
                // token is valid
                console.info('refresh ok, clobbering >> ', result, typeof result);
                _(this_.config).extend(result);
                this_.save_config(this_.config).then(function() {
                   d.resolve(result); 
                }).fail(function() { 
                    d.reject();
                });
            }).fail(function(bail) { 
                // token isn't valid anymore
                console.error('error >> ', bail);
                d.reject(bail);
            });
            return d.promise();
        }
    },
    getProfile: {
        value:function() {
            var d = u.deferred(), this_ = this;     
            this.assert(this.config.access_token, "No auth code", "authorization code");
            var base_url = 'https://api.moves-app.com/api/v1/user/profile?'+jQuery.param({access_token:this.config.access_token});
            console.log('url ', base_url);
            jQuery.ajax({type:'GET', url: base_url}).then(function(result) {
                console.log('profile info >> ', result);
                entities.toObj(result).then(function(pdatm) { 
                    this_.diary.set("profile",[pdatm]);
                    u.when([this_.diary.save(), pdatm.save()]).then(d.resolve).fail(d.reject);
                });
            }).fail(function(bail) { 
                // token isn't valid anymore
                console.error('ERROR getProfile >> ', bail);
                d.reject(bail);
            });
            return d.promise();
        }
    },
    _merge_into_diary:function(key, data) {
        var d = u.deferred(), this_ = this;
        var fail = function(err) { d.reject(err); };
        var cont = function() {
            this_.assert(this_.diary, "no diary loaded", "internal error");
            entities.toObj(data).then(function(pdatm) { 
                this_.diary.set(key,[pdatm]);
                u.when([this_.diary.save(), pdatm.save()]).then(d.resolve).fail(d.reject);
            });
        };
        if (!this.diary) {
            this._loadBox().then(function() { cont(); }).fail(fail); 
        } else {  cont();   }
        return d.promise();
    },
    _loadBox: { // ecmascript 5, don't be confused!
        value: function() {
            var this_ = this, config = this.config, d = u.deferred(), store = this.store;
            if (!config || !_(config).keys()) {  
                this_.debug(' no configuration set, aborting ');  
                d.reject();
                process.exit(-1);
                return;
            }
            var boxid = config.box;
            store.getBox(boxid).then(function(box) {
              // get moves diary
                this_.box = box;
                box.getObj('moves-diary').then(function(obj) { 
                    this_.diary = diary;
                    d.resolve(box,obj); 
                }).fail(function() { 
                    d.reject();
                });
            }).fail(function(err) { this_.debug('error getting box ', err); }); 
            return d.promise();
        }
    },
    _unpack: {
        value: function(c, box) {
            return d.promise();
        }
    }
});

var instantiate = function(indxhost) { 
    var d = u.deferred();
    var ws = Object.create(MovesService);
    ws.init(path.dirname(module.filename)).then(function() { 
        if (indxhost){ ws.setHost(indxhost); }
        d.resolve(ws);
    }).fail(function(bail) {
        output({event:"error", message:bail.message || bail.toString()});
        process.exit(1);
        d.reject();
    });
    return d.promise();
}

module.exports = {
    MovesService: MovesService,
    instantiate: instantiate,
    entities:entities
};

if (require.main === module) { 
    var entities = injector.get('entities');
    console.log('entities >> ', entities);

    // needs to know where we are so that it can find our filename
    instantiate().then(function(moves) {
        moves.check_args();
    });
}


