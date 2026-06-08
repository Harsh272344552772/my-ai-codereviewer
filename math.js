function calculateAverage(sum, count) {
  // Bug: division by zero if count is 0
  const average = sum / count;
  return average;
}

console.log(calculateAverage(10, 0));
