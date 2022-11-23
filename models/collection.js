const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const MintSchema = new Schema({
	wallet:{
		type: String,
		required: true
	},
    contractAddress: {
        type: String,
        required: true
    },
	type:{
		type: String,
		required: true
	},
	supply:{
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
	contractId: {
		type: String,
	},
	to: {
		type: String
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
	claimable: {
		type: String
	}
},{
	timestamps: true
});

const Collection = mongoose.model('collections', MintSchema);

module.exports = Collection;