const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const ClaimSchema = new Schema({
    sessionID: {
        type: String,
		required: true
    },
    ownerAddress: {
		type: String,
		required: true
	},
    whitelistAddresses: {
		type: Object,
	},
    supply: {
		type: Number,
		required: true
	},
	tokenId: {
		type: Number,
		required: true
	},
	limit: {
		type: Number,
	},
	collectionName: {
		type: String,
		required: true
	},
    collectionDescription: {
		type: String,
		required: true
	},
    contractAddress: {
		type: String,
		required: true
	},
    contractStandard: {
		type: String,
		required: true
	},
    exclusive: {
		type: Boolean,
	},
	status:{
		type: String,
	},
	startDate: {
		type: Number
	},
	endDate: {
		type: Number
	},
	customName: {
		type: String,
		unique: true
	},
	transactionHashes: {
		type: Array
	},
	reservedAddress: {
		type: String
	}
},{
	timestamps: true
});

const Claim = mongoose.model('Claim', ClaimSchema);

module.exports = Claim;
