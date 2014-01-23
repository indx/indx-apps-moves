
/**
 *  Moves Service for INDX ---
 *   (c) 2014 - Max Van Kleek, University of Southampton 
 * 
 *  This is an INDX service that grabs data from moves app: https://dev.moves-app.com/
 */

var nodeindx = require('../../lib/services/nodejs/nodeindx'),
    nodeservice = require('../../lib/services/nodejs/service'),
    u = nodeindx.utils,
    _ = require('underscore')
    jQuery = require('jquery'),
    path = require('path'),
    https = require('https'),
    output = nodeservice.output,
    angular = require('angular'),
    injector = nodeindx.injector,
    entities = injector.get('entities');

var toMovesDate = function(date) {
    u.assert(date instanceof Date, "Must be a Date");
    var yy = date.getFullYear(), mm = date.getMonth() + 1, dd = date.getDate();
    var s = ''+yy;
    s = s + (mm < 10 ? '0'+mm : mm);
    s = s + (dd < 10 ? '0'+dd : dd);
    return s;
};
var fromMovesDate = function(m_date) {
    var year = m_date.slice(0,4), m = m_date.slice(4,6), d = m_date.slice(6,8);
    var hour = m_date.slice(9,11), min = m_date.slice(11,13), sec = m_date.slice(13,15);
    var newdate = [year, m, d].join('/');
    var newtime = [hour,min, sec].join(':');
    return new Date(newtime + " " + newdate);
};
var daysBetween = function(date1, date2) {
    var diff = Math.abs(date2.valueOf() - date1.valueOf());
    return diff/(1000*60*60*24);
};

var MovesService = Object.create(nodeservice.NodeService, {
    run: { 
        // master run 
        value: function(store) {
            // run continuously
            var this_ = this;
            this.store = store;
            var doinit = function() {
                // console.log('doinit() -- ', config);
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
                // console.log('we have an access code, boyzz - init');
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
            // console.log('REDIRECT >>> ', params.redirect_uri);
            // console.log("CODE >> ", params.code);
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
            // console.error('getProfile() url >> ', base_url);
            jQuery.ajax({type:'GET', url: base_url}).then(function(result) {
                console.log('profile info >> ', result, 'object: ', _(result).isObject(), 'array : ', _(result).isArray());
                this_.whom.set({moves_id: result.userId});
                this_.diary.set({
                    whom:this_.whom,
                    userId: result.userId,  
                    timezone: result.profile.currentTimeZone && result.profile.currentTimeZone.id,
                    tzoffset : result.profile.currentTimeZone && result.profile.currentTimeZone.offset,
                    firstDate : fromMovesDate(result.profile.firstDate)
                });
                delete result.profile.currentTimeZone;
                delete result.profile.firstDate;
                this_.diary.set(result.profile);
                console.log('diary >> ', this_.diary.attributes);
                u.when([ this_.diary.save(), this_.whom.save() ]).then(d.resolve).fail(d.reject);                    
            }).fail(function(bail) { 
                // token isn't valid anymore
                console.error('ERROR getProfile >> ', bail);
                d.reject(bail);
            });
            return d.promise();
        }
    },
    getTimeline:{
        // gets the storyline, which looks like: 
        // [{
        //     "date": "20121212",
        //     "segments": [
        //         {
        //             "type": "place",
        //             "startTime": "20121212T000000Z",
        //             "endTime": "20121212T071430Z",
        //             "place": {
        //                 "id": 1,
        //                 "type": "unknown",
        //                 "location": {
        //                     "lat": 55.55555,
        //                     "lon": 33.33333
        //                 }
        //             }
        //         },
        // and transforms this into a series of MovesObservations
        value:function(from_date, to_date) {

            // 
            this.assert(daysBetween(from_date, to_date) < 8, "Only accepts date ranges 7 days wide.");
            this.assert(this.config.access_token, "No auth code", "authorization code");
            this.assert(this.diary, "No diary loaded");
            this.assert(this.diary.get('userId'), "No userid specifie");
            var d = u.deferred(), this_ = this;
            var whom = this.whom;
            var from_m = toMovesDate(from_date), to_m = toMovesDate(to_date);
            var base_url = 'https://api.moves-app.com/api/v1/user/storyline/daily?'
                + jQuery.param({from:from_m, to: to_m, access_token: this.config.access_token });

            console.info("url >> ", base_url);
            jQuery.ajax({type:'GET', url: base_url}).then(function(storyline) {
                // timeline 
                storyline.map(function(day) {
                    var date = day.date;
                    var dsegs = day.segments ? day.segments.map(function(segment) { return this_._saveSegment(segment); }) : [];
                    u.when(dsegs).then(d.resolve).fail(d.reject);
                });
            }).fail(d.reject);
            return d.promise();
        }
    },

    _makePlace: {
        /*  Places:
                id (optional): a unique identifier (per-user, 64 bit unsigned) of the place
                name (optional): name for the place
                type: one of:
                    unknown: the place has not been identified
                    home: the place is labeled as home
                    school: the place is labeled as school
                    work: the place is labeled as work
                    user: the place has been manually named
                    foursquare: the place has been identified from foursquare
                foursquareId (optional): foursquare venue id if applicable
                location: JSON object with:
                    lat: latitude coordinate as number
                    lon: longitude coordinate as number
        */        
        value:function(place) {
            var dr = u.deferred(), this_ = this;
            entities.locations.getByLatLng(this_.box, place.location.lat, place.location.lon).then(function(matching_locs) { 
                if (matching_locs && matching_locs.length) {  dr.resolve(matching_locs[0]); } else {
                    entities.locations.make(this_.box, place.name, place.type, place.location.lat, place.location.lon, place.id,
                        { foursquare_id: place.foursquare_id }).then(function(model_loc) { 
                            // save it before it gets lost
                            if (place.type == 'home') { model_loc.set({home_of: this_.whom}); }
                            if (place.type == 'work') { model_loc.set({work_of: this_.whom}); }
                            if (place.type == 'user') { model_loc.set({manually_labeled:true}); }
                            if (place.type == 'school') { model_loc.set({school_of: this_.whom}); }                            
                            model_loc.save().then(function() { dr.resolve(model_loc);   }).fail(dr.reject);
                    }).fail(dr.reject);
                }
            });
            return dr.promise();
        }
    },
    _makeTrackPointPlace: {
        value:function(trackPoint) {
            var dr = u.deferred(), this_ = this;
            entities.locations.getByLatLng(this_.box, trackPoint.lat, trackPoint.lon).then(function(matching_locs) { 
                if (matching_locs && matching_locs.length) {  dr.resolve(matching_locs[0]); } else {
                    entities.locations.make(this_.box, undefined, undefined, trackPoint.lat, trackPoint.lon).then(function(model_loc) { 
                        // save it before it gets lost
                        model_loc.save().then(function() { dr.resolve(model_loc);  }).fail(dr.reject);
                    }).fail(dr.reject);
                }
            });
            return dr.promise();
        }
    },
    _makeActivity: {
        /* 
            Activity:
            activity: activity type, one of “wlk” (walking),“cyc” (cycling),“run” (running) or “trp” (transport)
            startTime: start time of the activity in yyyyMMdd’T’HHmmssZ format
            endTime: end time of the activity in yyyyMMdd’T’HHmmssZ format
            duration: duration of the activity in seconds
            distance: distance for the activity in meters
            steps (optional): step count for the activity (if applicable)
            calories (optional): calories burn for the activity in kcal (if applicable), on top of the idle burn. Available if user has at least once enabled calories
            trackPoints (optional): JSON array of track points for the activity when requested with each track point having:
                lat: latitude coordinate
                lon: longitude coordinate
                time: timestamp in yyyyMMdd’T’HHmmssZ format
        */
        value: function(activity) {
            var da = u.deferred(), this_ = this;
            var activities = { 'wlk' : 'walking', 'cyc' : 'cycling', 'run': 'running', 'trp':'transport'};
            u.when(activity.trackPoints && activity.trackPoints.map(function(tP) { return this_._makeTrackPointPlace(tP); }) || u.dresolve()).then(function(trackObjects)  {
                entities.activities.make1(this_.box, activities[activity.activity],
                    this_.whom,
                    fromMovesDate(activity.startTime),
                    fromMovesDate(activity.endTime),
                    activity.distance,
                    activity.steps,
                    activities.calories,
                    trackObjects).then(function(activity_model) { 
                        activity_model.save().then(function() { da.resolve(activity_model); }).fail(da.reject); 
                    });
            }).fail(da.reject);
            return da.promise();
        }
    },
    _saveSegment:{
        /*
            Segment::

            type: “move” or “place”
            startTime: segment start time in yyyyMMdd’T’HHmmssZ format
            endTime: segment end time in yyyyMMdd’T’HHmmssZ format
            place (optional): a JSON object with info about the place
            activities (optional): JSON array of activities for the segment
        */
        value:function(segment) {
            var whom = this.whom, this_ = this, ds = u.deferred();;
            var get_acts = function(acts){  return acts.map(function(activity) { return this_._makeActivity(activity); }); };
            var dact = segment.activities ? get_acts(segment.activities) : u.dresolve();
            var dpl = segment.place ? this_._makePlace(segment.place) : u.dresolve();

            jQuery.when(u.when(dact), dpl).then(function(activities, place) { 
                var saved_acts = u.when(activities.map(function(a) { 
                    if (place) { a.set({where: place, diary:this_.diary}); }
                    return a.save();
                }));
                if (segment.type === 'move') {
                    // then our subactivities are self-describing
                    saved_acts.then(ds.resolve).fail(ds.reject);
                } else {
                    // this is a stay. 
                    var from_t = fromMovesDate(segment.startTime), to_t = fromMovesDate(segment.endTime);
                    entities.activities.make1(this_.box, 'stay', this_.whom, from_t, to_t ).then(function(am) {
                        am.set({diary:this_.diary});
                        u.when(am.save(), saved_acts).then(ds.resolve).fail(ds.reject);
                    }).fail(ds.reject);
                }
            });
            return ds.promise();
        }
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
                var objds = [box.getObj('moves-diary'), box.getObj(config.about_user)];
                u.when(objds).then(function(diaryobj) { 
                    this_.diary = diaryobj[0];
                    this_.whom = diaryobj[1];
                    d.resolve(box,this_.diary, this_.whom); 
                }).fail(function(bail) {  d.reject(bail); });
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
    entities:entities,
    testRun: function(host) {
        var d = u.deferred();
        instantiate(host).then(function(g) { 
            g.login().then(function(store) { 
                g.store = store; 
                g._loadBox().then(function() { 
                    console.log('done loading!! ')
                    d.resolve(g);
                }).fail(d.reject);
            }).fail(d.reject);
        });
        return d.promise();
    }
};
if (require.main === module) { 
    var entities = injector.get('entities');
  
    // needs to know where we are so that it can find our filename
    instantiate().then(function(moves) {
        moves.check_args();
    });
}


