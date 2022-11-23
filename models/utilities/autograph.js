var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var AutographSchema = new Schema({
	originalHash:{
		type: String,
		required: true
	},
	wallet:{
		type: String,
	},
	twitter: {
        type: String,
    },
	discord: {
		type: String,
	},
    redirect: {
        type: String,
    },
	tokenURI: {
		type: String,
	},
	transactionHash: {
		type: String,
	},
	type: {
		type: String,
		default: 'ERC721'
	},
	unlockables: {
		type: String,
	},
	phygital: {
		type: Boolean,
	},
	gift: {
		type: Boolean,
	}
},{
	timestamps: true
});

var Autograph = mongoose.model('Autograph', AutographSchema);

module.exports = Autograph;