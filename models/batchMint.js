const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const BatchMintUploadSchema = new Schema({
	wallet:{
		type: String,
		required: true
	},
	sessionID: {
        type: String,
    },
	name: {
        type: String,
    },
    hash:{
        type: String,
    },
	batchCount: {
		type: Number
	},
	transactionHashes: {
		type:  Array
	},
	refundHash: {
		type:  String
	},
	filesCount : {
		type: Number
	},
	collectionContract : {
		type: Object
	},
	gasPrice : {
		type: String
	},
	estimatedGas : {
		type: String
	},
	contractAddress : {
		type: String,
		default: "0x0"
	},
	depositedAmount : {
		type: String,
		default: "0"
	},
	totalGasUsed : {
		type: String,
		default: "0"
	},
	refundAmount : {
		type: String,
		default: "0"
	},
	status : {
		type: Object,
		default: { 
			s3: 'NULL',
			ipfs: 'NULL',
			gas: 'PENDING',
			mint: 'NULL',
			refund: 'NULL',
		}
	}
},{
	timestamps: true
});

const BatchMintUpload = mongoose.model('BatchMintUpload', BatchMintUploadSchema);

module.exports = BatchMintUpload;
