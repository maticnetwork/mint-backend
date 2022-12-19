const autocannon = require('autocannon');

const startBench = () => {
    const url = 'http://localhost:5000';
    const args = process.argv.slice(2);

    const numConnection = args[0] || 1000;
    const maxConnectionRequests = args[1] || 1000;

    const data = {
        wallet: "0x2631e5e8717fAeaD0EBa72fEd5694aD1Fa0d3581",
        type: "ERC721",
        network : "mumbai",
        amount: 1,
        tokenUri : "ipfs://bafyreibmxnleqmexxppzboatdx3452ughqnbhbyol5ih7dqulkz6z6ljae/metadata.json"
    };

    const cannon = autocannon({
        url,
        connections: numConnection,
        duration: 10,
        maxConnectionRequests,
        headers: {
            "content-type" : "application/json",
            "x-api-key" : "f5f07f10-e403-416a-8548-50d4483a47a1"
        },
        requests : [
            {
                method: "POST",
                path: '/v1/mint/single',
                setupRequest: (request) => {
                    request.body = JSON.stringify(data);
                    return request;
                }
            }
        ]

    }, finishedBench);

    autocannon.track(cannon);
};

const finishedBench = (err, res) => {
    console.log("Finished benchmark", err, res);
}

startBench();