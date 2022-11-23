const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MintSchema = new Schema({
	wallet:{
		type: String,
		required: true
	},
	type:{
		type: String,
		required: true
	},
	network: {
        type: String,
        required: true
    },
	tokenCategory: {
		type: String
	},
	supplyCount:{
		type: Number,
	},
    tokenURI: {
		type: String,
        required: true
	},
    transactionHash:{
		type: String,
		required: true
	},
	tokenId: {
		type: Number,
	},
	status: {
		type: String
	},
	unlockables: {
		type: String
	},
	autograph: {
		type: Boolean
	},
	phygital: {
		type: Boolean
	},
	gift: {
		type: Boolean
	},
	name: {
		type: String
	},
	imageType: {
		type: String
	},
	claimable: {
		type: String
	}
},{
	timestamps: true
});

const Mint = mongoose.model('Mint', MintSchema);

module.exports = Mint;