const CronJob = require('cron').CronJob;
const { deleteFromS3 } = require('../utils/S3');
const BatchMintUpload = require('../models/batchMint');

// Run Cron at midnight
const RunCron = async () => {
    // 0 */2 * * * * -> run every 2 min
    // 00 00 00 * * * -> run midnight
    const job = new CronJob('00 00 00 * * *', async () => {
        console.log('Running Cron');
        const unusedSessions = await BatchMintUpload.find({
            "$expr": {
                "$and": [
                    { "$gt": [{ "$dateDiff": { startDate: "$createdAt", endDate: "$$NOW", unit: "day" } }, 3] },
                    { "$ne": ["$status.mint", 'CONFIRMED'] },
                ],
            }
        }).select("sessionID");

        let deletePromise = unusedSessions.map(_ => deleteFromS3(_.sessionID, null))
        await Promise.all(deletePromise);

        console.log('Cron Finished');
    });
    job.start();
}

module.exports = {
    RunCron
};
