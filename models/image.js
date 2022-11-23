var mongoose = require('mongoose');

var Schema = mongoose.Schema;

var ImageSchema = new Schema({
	name: {
		type: String,
		required: true
	},
	type:{
		type: String,
		required: true
	},
	ipfs: {
		type: String,
		required: true
	},
},{
	timestamps: true
});

var Image = mongoose.model('Image', ImageSchema);

module.exports = Image;