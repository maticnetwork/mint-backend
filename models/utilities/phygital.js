var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var PhygitalSchema = new Schema({
    transactionHash:{
        type: String,
        required: true
    },
	wallet:{
		type: String,
		required: true
	},
	orderData: {
        type: Object,
        required: true
    },
    isEmailSent: {
        type: Boolean
    }
},{
	timestamps: true
});

var Phygital = mongoose.model('Phygital', PhygitalSchema);

module.exports = Phygital;