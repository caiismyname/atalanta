function generateDatestamp(foo) {
    const datestamp = `${foo.getFullYear()}-${foo.getMonth() + 1}-${foo.getDate()}`;
    return datestamp;
}

const queriedDates = [];

for (let i = 0; i < 4; i++) {
    let today = new Date();
    today.setDate(today.getDate() - i);
    queriedDates.push(generateDatestamp(today));
}

console.log(queriedDates)