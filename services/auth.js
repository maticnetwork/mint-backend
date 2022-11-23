const User = require("../models/user");
const Web3 = require("web3");

const ApiError = require("../utils/ApiError");
const { v4: uuid } = require("uuid");
const web3 = new Web3('https://rpc-mumbai.matic.today/');

const nonceWalletCheck = async (wallet) => {
    try {
    let userData = "";
    const newUID = uuid();
    const nonce = uuid();
    const WalletCheck = await User.findOne({ wallet: wallet });
    if (WalletCheck) {
        const updateData = await User.updateOne({
            wallet: wallet,
        },{
            $set: {
                nonce: nonce,
            }     
    });
    if(!updateData){
      throw new  ApiError(400, 'User Not Found');
    } else {
        userData = nonce; 
    }

    } else {
      const NewUser = await User.create({
        wallet: wallet,
        userID: newUID,
        nonce: nonce,
      });
        if(!NewUser){
            throw new  ApiError(400, 'Error Creating Nonce');
        }
        userData = nonce;
    } 
    return userData;
} catch (err) {
  console.log(err);
}
}


const twitterIdCheck = async (twitterID, wallet) => {
    try{
        let userData = "";
        const newUID = uuid();
        const nonce = uuid();
        const idCheck = await User.findOne({ wallet });
        if (idCheck) {
            const twitterCheck = await User.findOne({ twitterID });

            if(twitterCheck) {
                const updateData = await User.updateOne(
                    { twitterID, wallet },
                    { $set: { nonce: nonce } }
                );

                if(!updateData)
                    throw new  ApiError(400, 'User Not Found');
            } else {
                const updateData = await User.updateOne(
                    { wallet },
                    { $set: { 
                        nonce: nonce,
                        twitterID,
                    }}
                );

                if(!updateData)
                    throw new  ApiError(400, 'User Not Found');
            }

            userData = nonce; 
        } else {
            const NewUser = await User.create({
                twitterID,
                wallet,
                userID: newUID,
                nonce: nonce,
            });

            if(!NewUser)
                throw new  ApiError(400, 'Error Creating Nonce');

            userData = nonce;
        } 

        return userData;
    } catch (err) {
        console.log(err);
    }
}

const AddSocialUserApi = async (wallet, name) => {
    try {
        const userData = await User.findOne({ wallet });
        if(userData) {
            const APIKey = uuid();

            if(userData.socialApi.length>=10)
                throw new ApiError(400, 'Cannot Add more than 10 Social Api(s)');

            const apiObj =  [...userData.socialApi, { name, api: APIKey, status: 'ACTIVE' }];
            await User.findOneAndUpdate({wallet: wallet}, {$set: {
                socialApi: apiObj
            }});

            return { name, api: APIKey, status: 'ACTIVE' };
        } else {
            throw new ApiError(400, 'User Not Found');
        }
    } catch (err) {
        console.log(err)
    }
}

const FetchSocialUserApi = async (wallet) => {
    try {
        const userData = await User.findOne({ wallet });
        if(userData) {
            return userData.socialApi;
        } else {
            throw new ApiError(400, 'User Not Found');
        }
    } catch (err) {
        console.log(err)
    }
}

const FetchUser = async (wallet,signature) => {
    try {
        const userData = await User.findOne({ wallet: wallet});
        if (userData) {
            const address = web3.eth.accounts.recover(userData.nonce,signature);
            if(address === wallet){
                if(!userData.api) {
                    const APIKey = uuid();
                    await User.findOneAndUpdate({wallet: wallet}, {$set: {api: APIKey}});
                    return APIKey;
                }
                return userData.api;
            } else {
                throw new ApiError(401, 'Authentication failed');
            }
        } else {
            throw new ApiError(400, 'User Not Found');
        } 
    } catch (err) {
        console.log(err);
    }
}

module.exports = {
    nonceWalletCheck,
    twitterIdCheck,
    AddSocialUserApi,
    FetchSocialUserApi,
    FetchUser,
};

