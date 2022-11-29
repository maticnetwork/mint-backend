const express = require("express");
const router = express.Router();
const Crypto = require('crypto');
const Bcrypt = require('bcrypt');
const JWT = require('jsonwebtoken');

const { check, validationResult } = require("express-validator");
const Web3 = require("web3");

const { requestCopeClient, TOKENS_COPE } = require('../utils/Config');
const { TwitterApi } = require('twitter-api-v2');

const User = require('../models/user');
const passport = require('passport').Passport;
const passportUser = new passport();

const catchAsync = require('../utils/catchAsync');
const { nonceWalletCheck,FetchUser, AddSocialUserApi, FetchSocialUserApi } = require('../services/auth');
const uuid = require('uuid');

const AuthCheck = require('../middleware/API');
const { SignatureCheck } = require("../middleware/Signature");
const { type } = require("os");
const { getGasTankBalance }= require('./utilities/gasTank');

const DiscordStrategy = require('passport-discord').Strategy;
passportUser.serializeUser((profile, done) => {
    done(null, profile);
});
passportUser.deserializeUser((obj, done) => {
    done(null, obj);
});
passportUser.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT_COPE,
    clientSecret: process.env.DISCORD_SECRET_COPE,
    state: true,
    store: true,
    callbackURL: process.env.DISCORD_COPE_CALLBACK,
    scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
    const { id, username, discriminator, avatar, email } = profile;
    const data = {
        profile,
        accessToken,
    }
    try {
        return done(null, data);
    } catch (error) {
        return done(null, {
            error: 'Oops! Something went wrong.'
        });
    }
}
))


const user = (redisClient) => {
	const router = express.Router();
	router.post("/nonce",[
		check('wallet').notEmpty().withMessage('Wallet is required')
	], catchAsync(async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({
				errors: errors.array()
			});
		}
		const wallet = req.body.wallet;
		const nonce = await nonceWalletCheck(wallet);
		if(!nonce){
		return res.status(400).json({
			message: "Invalid wallet"
		});
		}
		res.status(200).json({
			nonce: nonce
		});
		}
	));

	router.post("/auth",[
		check('wallet').notEmpty().withMessage('Wallet is required'),
		check('signature').notEmpty().withMessage('Signature is required')
	],catchAsync(async (req, res) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
		return res.status(400).json({
			errors: errors.array()
		});
		}
		const wallet = req.body.wallet;
		const signature = req.body.signature;
		const api = await FetchUser(wallet,signature);
		if(!api){
			return res.status(401).json({
				message: 'Authentication failed'
			});
		}
		res.status(200).json({
			apiKey: api
		});
		}
	));



	router.get("/key/auth/twitter",
		async(req, res) => {

			const { wallet,redirect_uri } = req.query;
			try {
				const user = await User.findOne({wallet: wallet});
				if(user){
					const newUser = await User.findOneAndUpdate({
						wallet: wallet,
					}, {redirect: redirect_uri});
					//await newUser.save();
				}

				const { url, oauth_token, oauth_token_secret } = await requestCopeClient.generateAuthLink(process.env.TWITTER_COPE_CALLBACK);

				req.session.oauthToken = oauth_token;
				req.session.oauthSecret = oauth_token_secret;
				req.session.wallet = wallet;
				await res.redirect(url);
			}
			catch(err){
				console.error(err.message);
				res.status(500).send("Server Error");
			}
		}      
	)


	router.get("/key/auth/twitter/callback", async (req, res) => {
		if (!req.query.oauth_token || !req.query.oauth_verifier) {
			res.status(400).send('Bad request, or you denied application access. Please renew your request.' );
			return;
		}
		const { oauth_token, oauth_verifier } = req.query;
		const wallet = req.session.wallet;

		try {

			const DB = await User.findOne({ wallet: wallet});
			if (!DB) {
				return res.status(400).json({
					msg: "User not found",
				});
			}

			if(DB.discord) {
				return res.status(400).send('The wallet is authenticated with different account!');
			}

			const token = req.query.oauth_token 
			const verifier = req.query.oauth_verifier 
			const savedToken = req.session.oauthToken;
			const savedSecret = req.session.oauthSecret;


			if (!savedToken || !savedSecret) {
				res.status(400).send('OAuth token is not known or invalid. Your request may have expire. Please renew the auth process.');
				return;
			}

			const tempClient = new TwitterApi({ ...TOKENS_COPE, accessToken: token, accessSecret: savedSecret });

			const { accessToken, accessSecret, screenName, userId } = await tempClient.login(verifier);

			console.log('Twitter UserName - ', screenName);

			const userTwitter = await User.findOne({ 'twitter.id': userId});

			if(userTwitter) {
				if(userTwitter.wallet !== wallet) {
					return res.status(400).send('The account is already authenticated with other wallet address!');
				}
			} else {
				if(!DB.twitter) {
					await User.findOneAndUpdate({ wallet: wallet }, {
						$set: {
							twitter: {
								name: `@${screenName}`,
								id: userId
							}
						}
					});
				} else {
					return res.status(400).send('The wallet is authenticated with another twitter account! Please sign in using the right account!');
				}
				
			}

			return res.redirect(DB?.redirect + "?username=" + screenName + "?userId" + userId);

		}
		catch (err) {
			console.error(err.message);
			res.status(500).send("Server Error");
		}
	});

	router.get('/key/auth/discord', async (req, res ) => {
		const errors = validationResult(req);
		if (!errors.isEmpty()) {
			return res.status(400).json({ errors: errors.array() });
		}
		const { wallet,redirect_uri } = req.query;
		try {
			const user = await User.findOne({ wallet: wallet });
			
			if(user){
				const newUser = await User.findOneAndUpdate({
					wallet: wallet,
				}, {redirect: redirect_uri});
				//await newUser.save();
			}
			req.session.wallet = wallet;
			req.session.redirect_uri = redirect_uri;
		
			//pass the user to the passport strategy
			await passportUser.authenticate('discord',{
				session: true,
				failureRedirect: redirect_uri,
				successRedirect: redirect_uri
			})(req, res);
	
		} catch (err) {
			console.error('Error:' , err.message);
			return res.status(500).send("Server Error");
		}
	});
	
	router.get('/key/auth/discord/callback', passportUser.authenticate('discord'), async (req, res) => {
		const { wallet,redirect_uri } = req.session;
		try {
			const user = await User.findOne({ wallet: wallet });
			if (!user) {
				return res.status(400).json({
					error: "User not found",
				});
			}

			if(user.twitter) {
				return res.status(400).send('The wallet is authenticated with different account!');
			}

			console.log(`Discord UserName - `, req.user.profile.username);
			const discordUser = await User.findOne({ discord: req.user.profile.username });

			if(discordUser) {
				if(discordUser.wallet !== wallet) {
					return res.status(400).send('The account is already authenticated with other wallet address!');
				}
			} else {
				if(!user.discord) {
					await User.findOneAndUpdate({ wallet: wallet }, { $set: {
						discord: req.user.profile.username
					}});
				} else {
					return res.status(400).send('The wallet is authenticated with another discord account! Please sign in using the right account!'); 
				}
				
			}

			return res.redirect(redirect_uri + "?username=" + req.user.profile.username);
		} catch (err) {
			console.error(err.message);
			return res.status(500).send("Server Error");
		}
	});

	router.get('/isCreatedKeys/:wallet',
	[
		check('wallet').notEmpty().withMessage('Wallet is required'),
	], AuthCheck, async(req, res) => {
		try {
			const { wallet } = req.params;
			const user = await User.findOne({wallet});

			if(!user.twitter && !user.discord) 
				return res.status(400).send("Bad Request")

			const apis = await FetchSocialUserApi(wallet);

			let activeApis = apis.filter((item) => item.status === 'ACTIVE');

			const isCreated = activeApis.length > 0;

			return res.status(200).json({isCreated});
			
		} catch(e) {
			console.log(e);
			return res.status(500).json({error: e});
		}
	});

	router.post('/social/apikeys', AuthCheck, SignatureCheck, async (req, res)=> {
		try {
			const { wallet } = req.params;
			const WINDOW = 24 * 60 * 60 * 1000; // 1 day in ms
			const ALLOWED_REQUESTS = 10000; // 10,000 requests per API token
			const user = await User.findOne({ wallet: wallet});
			if(!user.twitter && !user.discord) 
				return res.status(400).send("Bad Request")

			const apis = await FetchSocialUserApi(wallet);

			let activeApis = apis.filter((item) => item.status === 'ACTIVE');

			let newApis = [];

			

			for(let i = 0; i < activeApis.length; i++) {
				let reqDetails;
				try {
					const redis = await redisClient;
					reqDetails = await redis.get(activeApis[i].api);
				} catch(e) {
					console.log(e);
				}
				let data = JSON.parse(reqDetails);
				let redisData = {}

				if(data === null) {
					redisData["requestsRemaining"] = ALLOWED_REQUESTS;
					redisData["timestamp"] = null;
				} else {
					if (data.timestamp + WINDOW <= (+ new Date())) {
						redisData["timestamp"] = + new Date(),
						redisData["requestsRemaining"] = ALLOWED_REQUESTS;
					} else {
						redisData["requestsRemaining"] = data.requestsRemaining;
						redisData["timestamp"] = data.timestamp;
					}
				}
				
				const originalData = activeApis[i];

				newApis.push({...originalData.toObject(), ...redisData, });

			}

			activeApis = newApis;

			return res.status(200).json({
				api: activeApis
			});
		} catch (err) {
			console.error(err.message);
			return res.status(500).json(err);
		}
	});


	const generateSecretKey = async() => {
		return Crypto.randomBytes(32).toString('hex');
	}

	router.post('/generateToken', AuthCheck, async (req, res) => {
		try {
			const { wallet } = req.body;
			const isGenerated = await User.findOne({wallet});
			if(isGenerated.secretKeyHash) {
				return res.status(400).json({message: "Key already generated!"});
			}
			const key = await generateSecretKey();
			await User.findOneAndUpdate({wallet}, {secretKeyHash: key});
			
			return res.status(200).json({status: true, key});
		} catch(e) {
			console.log(e);
			return res.status(500).json({status: false, message: e});
		}	
	});

	router.post('/regenerateToken', AuthCheck, async(req, res) => {
		try {
			const { wallet } = req.body;
			const isGenerated = await User.findOne({wallet});
			if(!isGenerated.secretKeyHash) {
				return res.status(400).json({message: "Key not generated for this account!"});
			}

			const key = await generateSecretKey();
			await User.findOneAndUpdate({wallet}, {secretKeyHash: key});
			
			return res.status(200).json({status: true, key});
			
		} catch(e) {
			console.log(e);
			return res.status(500).json({status: false, message: e});
		}
	});


	router.post('/create', AuthCheck, SignatureCheck, async (req, res) => {
		try {
			const { name, wallet } = req.body;

			const user = await User.findOne({ wallet: wallet});
			if(!user?.twitter?.id && !user.discord)
				return res.status(400).json({message: "Bad Request! User not authorized"})

			if(!name || !wallet) {
				return res.status(400).json({message: "API Name or Wallet Address is missing"});
			}

			const apis = await FetchSocialUserApi(wallet);
			console.log(apis);

			const activeApis = await apis.filter((item) => item.status === 'ACTIVE');

			if(activeApis.length < 2) {
				const apiKeys = await AddSocialUserApi(wallet, name);

				return res.status(200).json({
					api: apiKeys
				})
			} else {
				return res.status(400).json({
					code: 400,
					message: 'Only 2 active api keys can be created!'
				})
			}

			
		} catch (err) {
			console.error('Error:', err.message);
			return res.status(500).json(err);
		}
	});

	router.post('/delete', AuthCheck, SignatureCheck, async(req, res) => {
		try {
			const {wallet, key} = req.body;

			const user = await User.findOne({wallet: wallet, "socialApi.api": key, "socialApi.status": "ACTIVE"});
			if(user) {
				const user = await User.findOneAndUpdate({ wallet: wallet, "socialApi.api": key}, {$set : {"socialApi.$.status": "INACTIVE" }});

				if(user) {
					return res.status(200).json({code: 200, message: 'API key deleted successfully'});
				} else {
					return res.status(400).json({code: 400, message: 'Bad data'});
				}
			}
			else {
				return res.status(400).json({
					status: 400,
					message: 'API key not found!'
				})
			}

		} catch(e) {
			return res.status(500).json(e);
		}
	});


	router.get('/status/:key', AuthCheck, async(req, res) => {
		try {
			const {key} = req.params;
			const redis = await redisClient;

			const reqDetails = await redis.get(key);

			if(reqDetails) {
				return res.status(200).json(JSON.parse(reqDetails));
			} else {
				return res.status(200).json({data: 'No data'});
			}
		} catch(e) {
			res.status(500).json(e);
		}
		
	});


	router.post('/generateJWT', AuthCheck, SignatureCheck, async(req, res) => {
		try {
			const { wallet } = req.body;

			const user = await User.findOne({wallet});
			if(!user) {
				return res.status(400).json({status: false, message: "User not found!"});
			}

			if(user.refreshToken) return res.status(400).json({status: false, message: "JWT already generated for this account!"});

			const token = JWT.sign({wallet}, process.env.JWT_SECRET, {expiresIn: '12h'});
			const refreshToken = Crypto.randomBytes(32).toString('hex');

			await User.findOneAndUpdate({wallet}, {refreshToken});

			return res.status(200).json({status: true, jwt: token, refreshToken});

		} catch(e) {
			console.log(e);
			res.status(500).json({status: false, message: e});
		}
	});

	

	//It should be signature checked route.
	router.post('/regenerateRefreshToken', AuthCheck, async(req, res) => {
		try {
			const { wallet } = req.body;
			if(!wallet) return res.status(400).json({status: false, message: "Wallet address not provided!"});

			const refreshToken = req.headers['x-refresh-token'];

			const user = await User.findOne({wallet});
			console.log(user.refreshToken, refreshToken);
			if(user && user.refreshToken && user.refreshToken === refreshToken) {
				const newRefreshToken = Crypto.randomBytes(32).toString('hex');
				await User.findOneAndUpdate({wallet, refreshToken}, {refreshToken: newRefreshToken});
				return res.status(200).json({status: true, message: "Success", refreshToken: newRefreshToken});
			} else {
				return res.status(400).json({status: false, message: 'Invalid token!'});
			}

		} catch(e) {
			console.log(e);
			res.status(500).json({status: false, message: e});
		}
	});

	router.post('/getRefreshToken', AuthCheck, SignatureCheck, async(req, res) => {
		try {
			const { wallet } = req.body;
			if(!wallet) return res.status(400).json({status: false, message: "Wallet address not provided!"});

			const user = await User.findOne({wallet});
			if(!user) return res.status(400).json({status: false, message: "Wallet account not found!"});

			if(user.refreshToken) {
				return res.status(200).json({status: true, message: "Token found", token: user.refreshToken});
			} else {
				return res.status(400).json({status: false, message: "Token not found"});
			}

		} catch(e) {
			return res.status(500).json({status: false, message: e});
		}
	});


	router.get('/none/now/no/getUserDetails', AuthCheck, async(req, res) => {
		try {
			const userData = await User.find({'socialApi.0': {$exists: true}});

			if(userData) {
				return res.status(200).json({userData});
			}
		} catch(e) {
			return res.status(500).json({status: false, message: e})
		}
	});

	router.get('/gasTankBalance/:wallet', AuthCheck, async(req, res) => {
		try {
			const { wallet } = req.params;
			if(!wallet) return res.status(400).json({status: false, message: "Wallet address not provided!"});

			const user = await User.findOne({wallet});
			if(!user) return res.status(400).json({status: false, message: "Wallet account not found!"});

			const balance = await getGasTankBalance(wallet);

			return res.status(200).json({status: true, balance });
		} catch(e) {
			return res.status(500).json({status: false, message: e});
		}
	});

	return router;
}


module.exports = user;
