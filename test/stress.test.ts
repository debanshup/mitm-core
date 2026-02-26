import http from "http";

const PROXY_HOST = "localhost";
const PROXY_PORT = 8001;
const TARGET_URL = "https://youtube.com"; // Where the proxy should go
const CONCURRENT_REQUESTS = 50; // Requests at a time
const TOTAL_REQUESTS = 1000;

let completed = 0;
let errors = 0;

function sendRequest() {
  if (completed + errors >= TOTAL_REQUESTS) return;

  const options = {
    host: PROXY_HOST,
    port: PROXY_PORT,
    path: TARGET_URL,
    headers: {
      Host: "google.com",
    },
  };

  http
    .get(options, (res) => {
      res.on("data", () => {}); // Consume data to free memory
      res.on("end", () => {
        completed++;
        checkProgress();
        sendRequest(); // Send next request
      });
    })
    .on("error", (err) => {
      errors++;
      checkProgress();
      sendRequest();
    });
}

function checkProgress() {
  if ((completed + errors) % 100 === 0) {
    console.log(
      `Progress: ${completed + errors}/${TOTAL_REQUESTS} (Errors: ${errors})`,
    );
  }
  if (completed + errors === TOTAL_REQUESTS) {
    console.log("--- Test Complete ---");
    console.log(`Success: ${completed} | Errors: ${errors}`);
  }
}

// Start the flood
console.log(`Starting stress test on port ${PROXY_PORT}...`);
for (let i = 0; i < CONCURRENT_REQUESTS; i++) {
  sendRequest();
}
