function createReporter() {
  let failed = 0;
  return {
    fail(msg) {
      failed++;
      console.log("FAIL " + msg);
    },
    ok(msg) {
      console.log("OK   " + msg);
    },
    getFailed() {
      return failed;
    },
  };
}

module.exports = { createReporter };
