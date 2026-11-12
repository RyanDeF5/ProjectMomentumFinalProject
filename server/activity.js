/** Finish already-sent requests, but do not start the next step while every page is away. */
async function waitForActivity(isActive, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) {
  while (!isActive()) await wait(1000);
}

module.exports = { waitForActivity };
