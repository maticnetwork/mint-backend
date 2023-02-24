var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var UserSchema = new Schema({
	wallet:{
		type: String,
		required: true,
        index: true
	},
	userID: {
        type: String,
        default: '',
        required: true
    },
    nonce: {
        type: String,
        required: true,
    },
    api:{
        type: String,
        default: '',
    },
    socialApi: {
        type: [{
            name: String,
            api: String,
            status: String,
        }],
        validate: {
            validator: function() {
                return this.socialApi.length <= 10;
            },
            message: 'Cannot have more than 10 Social Api(s)'
        }
    },
    customContracts: {
        type: Array,
    },
    redirect: {
        type: String
    },
    twitter: {
        type: {
            name: String,
            id: String
        }
    },

    discord: {
        type: String
    },
    discordUnique: {
        type: {
            name: String,
            id: String,
        }
    },
    secretKeyHash: {
        type: String
    },
    refreshToken: {
        type: String
    },
    gasFeeUtilized: {
        type: String
    }
},{
    timestamps: true
});

var User = mongoose.model('User', UserSchema);

module.exports = User;