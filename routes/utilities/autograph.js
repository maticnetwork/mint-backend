const express = require('express');
const router = express.Router();

const Autograph = require('../../models/utilities/autograph'); 
const Mint = require('../../models/mint')
const { check, validationResult } = require('express-validator');
const { web3, biconomy, globalNFT } = require('../../config/Biconomy'); 

const fs = require('fs');
const formidable = require("formidable");
const { NFTStorage, File } = require('nft.storage');
const passport = require('passport');
const getProfileInfo = require('../../services/googleOAuth');
const { TwitterApi } = require('twitter-api-v2');
const { requestClient, TOKENS } = require('../../utils/Config');
const AuthCheck = require('../../middleware/API');

const HDWalletProvider = require("@truffle/hdwallet-provider");

const ABI = globalNFT.Autograph.abi;

const CONTRACT = globalNFT.Autograph.address;
const NFT_STORAGE_KEY = process.env.NFT_STORAGE_KEY;

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER_URL = process.env.PROVIDER_URL;




const WEB3_STORAGE_KEY = process.env.WEB3_STORAGE_KEY

const DiscordStrategy = require('passport-discord').Strategy;
const uuid = require('uuid');


passport.serializeUser((profile, done) => {
    done(null, profile);
});

passport.deserializeUser((obj, done) => {
    done(null, obj);
});

passport.use(new DiscordStrategy({
    clientID: process.env.DISCORD_CLIENT,
    clientSecret: process.env.DISCORD_SECRET,
    state: true,
    store: true,
    callbackURL: process.env.DISCORD_CALLBACK,
    scope: ['identify', 'email']
}, async (accessToken, refreshToken, profile, done) => {
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

const callback = process.env.TWITTER_CALLBACK;

router.get("/auth/twitter",
    async(req, res) => {
        const { txhash,redirect_uri } = req.query;
        try {
            const user = await Autograph.findOne({originalHash: txhash});
            if(!user){
                const newUser = new Autograph({
                    originalHash: txhash,
                    redirect: redirect_uri
                });
                await newUser.save();
            }
            const { url, oauth_token, oauth_token_secret } = await requestClient.generateAuthLink(callback)
       
            req.session.oauthToken = oauth_token;
            req.session.oauthSecret = oauth_token_secret;
            req.session.txhash = txhash;
            await res.redirect(url);
        }
        catch(err){
            console.error(err.message);
            return res.status(500).send("Server Error");
        }
    }       
)

router.get("/auth/twitter/callback", async (req, res) => {
    if (!req.query.oauth_token || !req.query.oauth_verifier) {
        return res.status(400).send('Bad request, or you denied application access. Please renew your request.' );
    }

    const txhash = req.session.txhash;
    console.log("REQ LOG:",req.session)
    try {

        const DB = await Autograph.findOne({ originalHash: txhash});
        if (!DB) {
            return res.status(400).json({
                msg: "User not found",
            });
        }
        
        const token = req.query.oauth_token 
        const verifier = req.query.oauth_verifier 
        const savedToken = req.session.oauthToken;
        const savedSecret = req.session.oauthSecret;


        if (!savedToken || !savedSecret) {
            return res.status(400).send('OAuth token is not known or invalid. Your request may have expire. Please renew the auth process.');
        }

        const tempClient = new TwitterApi({ ...TOKENS, accessToken: token, accessSecret: savedSecret });
      
        const { accessToken, accessSecret, screenName, userId } = await tempClient.login(verifier);

     
        await Autograph.findOneAndUpdate({ originalHash: txhash }, {
            $set: {
                twitter: `@${screenName}`,
            }
        });

        return res.redirect(DB?.redirect + "?username=" + screenName);

    }
    catch (err) {
        console.error(err.message);
        return res.status(500).send("Server Error");
    }
}
);

router.get('/auth/discord', [
    check('txhash').notEmpty()
], async (req, res ) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { txhash,redirect_uri } = req.query;
    try {
        const user = await Autograph.findOne({ originalHash: txhash });
        if (!user) {
            const newUser = new Autograph({
                originalHash: txhash,
                redirect: redirect_uri
            });
            await newUser.save();
        }
        req.session.txhash = txhash;
        req.session.redirect_uri = redirect_uri;
    
        //pass the user to the passport strategy
        await passport.authenticate('discord',{
            session: true,
            failureRedirect: redirect_uri,
            successRedirect: redirect_uri
        })(req, res);

    } catch (err) {
        console.error(err.message);
        return res.status(500).send("Server Error");
    }
});

router.get('/auth/discord/callback', passport.authenticate('discord'), async (req, res) => {
    const { txhash,redirect_uri } = req.session;
    
    try {
        const user = await Autograph.findOne({ originalHash: txhash });
        if (!user) {
            return res.status(400).json({
                error: "User not found",
            });
        }

        req.session.txhash = txhash;
        console.log(req.user.profile.username);

        await Autograph.updateOne({ originalHash: txhash }, { $set: {
            discord: req.user.profile.username
        } });
        return res.redirect(redirect_uri + "?username=" + req.user.profile.username);
    } catch (err) {
        console.error(err.message);
        return res.status(500).send("Server Error");
    }
});


router.post("/upload", async (req, res) => {
 
    try {
        const dir = `${path.join(__dirname, "../uploads/singlemint/")}`;
        if(!fs.existsSync(dir)) {
          fs.mkdirSync(dir);
        }

        const form = formidable({ multiples: true, uploadDir: dir, keepExtensions: false, maxFileSize: 100 * 1024 * 1024 });

        // Gets the stream coming from frontend as fields and files
        form.parse(req, async (err, fields, files) => {
            try {
            console.log(err);
            if (err) {
                return res.send(500).json({err});
            }
            
            var tempfile = files.image;
		
	
  
		var fileBuffer = fs.readFileSync(tempfile.filepath);
		
  
		var file = new File([fileBuffer], tempfile.originalFilename, {
		  type: tempfile.mimetype,
		});
		console.log(file)
        var tempMetadata = fields.metadata;
		var metadata = JSON.parse(tempMetadata);
		metadata.image = file;
        try {
			const nftstorage = new NFTStorage({ token: NFT_STORAGE_KEY });
			const data = await nftstorage.store({
			image: file,
			...metadata,
			});
    
            return res.status(200).json({
                ipfs: data.url,
            });
        } catch (err) {
            console.error(err.message);
            res.status(500).send(err);
        }
       
    } 
  
    catch (err) {
        console.error(err.message);
        res.status(500).send(err);
    }
})
} catch (err) {
    console.error(err.message);
    res.status(500).send(err);
}
});

router.post("/generate",
[
    check('wallet').isEthereumAddress().notEmpty(),
    check('txhash').notEmpty(),
    check('metadata').notEmpty(),
],
async (req, res) => {
 
    try {
       const errors = validationResult(req);
       if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
        }
        const { wallet, metadata,txhash } = req.body;
        try {
            let response
            const DB = await Autograph.findOne({ originalHash: txhash });
            if (!DB) {
                return res.status(400).json({
                    error: "User not found",
                });
            }
            const nft721 = new web3.eth.Contract(ABI,CONTRACT,biconomy.getSignerByAddress(process.env.MINTER));
            try {

                response = await nft721.methods.mint(wallet,metadata).send({
                    from: process.env.MINTER
                });
                if(response){
                    await Autograph.findOneAndUpdate({ originalHash: txhash }, {
                        wallet: wallet,
                        tokenURI: metadata,
                        transactionHash: response.transactionHash,
                    });
                    await Mint.findOneAndUpdate({
                        transactionHash: txhash
                      }, {
                        autograph: true
                      })
                    return res.status(200).json({
                        ipfs: metadata,
                        tx: response.transactionHash,
                    });
                }
            } catch (error) {
                console.log(error);
                return res.status(500).json({
                    error
                });
            }
        }
        catch (error) {
            console.log(error);
            return res.status(500).json({
                error
            });
        }

} catch (err) {
    console.error(err.message);
    res.status(500).send(err);
}
});



router.get("/info",[
    check("txhash").notEmpty(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    const { txhash } = req.query;
    try {
        const user = await Autograph.findOne({ originalHash: txhash });
        if (!user) {
            return res.status(400).json({
                msg: "User not found",
            });
        }
        const { twitter,discord } = user;
        return res.status(200).json({
           twitterID: twitter,
           discordID: discord,
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send("Something went wrong");
    }
});


module.exports = router;
