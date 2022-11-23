var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var GiftSchema = new Schema({
	transactionHash:{
		type: String,
		required: true
	},
    wallet: {
        type: String,
        required: true
    },
	to: {
        type: Array,
        required: true
    },
    type: {
        type: String,
        required: true
    },
    tokenID: {
        type: Number,
        required: true
    }
},{
	timestamps: true
});

var Gift = mongoose.model('Gift', GiftSchema);

module.exports = Gift;