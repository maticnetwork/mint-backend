const { ListObjectsV2Command, DeleteObjectsCommand } = require("@aws-sdk/client-s3");
const { S3 } = require("../config/Aws");
const Bucket = process.env.S3_MEDIA_BUCKET;

async function deleteFromS3(sessionID, ContinuationToken) {
    try {
        let listParams = { Bucket, Prefix: sessionID };

        if(ContinuationToken) {
            console.log(`Continuting Deleting sessionID: ${sessionID}`);
            listParams.ContinuationToken = ContinuationToken;
        } else {
            console.log(`Deleting S3 of sessionID: ${sessionID}`);
        }
            
        const listObjects = await S3.send(
            new ListObjectsV2Command(listParams)
        );

        if (listObjects.Contents && listObjects.Contents.length) {
            const deleteTx = await S3.send(
                new DeleteObjectsCommand({
                    Bucket, Delete: {
                        Objects: listObjects.Contents.map(_ => ({ Key: _.Key }))
                    }
                })
            );

            if (+deleteTx['$metadata'].httpStatusCode === 200 && !listObjects.IsTruncated)
                console.log(`Successfully deleted S3 for sessionID: ${sessionID}`)

            if(listObjects.IsTruncated) {
                console.log(`Continuting Deleting using NextContinuationToken for sessionID: ${sessionID}`)
                return deleteFromS3(sessionID, listObjects.NextContinuationToken)
            } else {
                return deleteTx;
            }
        }
    } catch (e) {
        console.log(e);
    }
}

module.exports = {
    deleteFromS3
}
