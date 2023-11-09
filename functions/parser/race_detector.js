const raceDistances = [
    21097.5,
    42195
]

const raceNames = {
    21097.5: "Half Marathon",
    42195: "Marathon"
}

function isRace(run) {
    for (const raceDist of raceDistances) {
        if ((Math.abs(run.distance - raceDist) / raceDist) <= 0.02) {
            return true;
        }
    }

    return false;
}

function detectRaceType(run) {
    for (const raceDist of raceDistances) {
        if ((Math.abs(run.distance - raceDist) / raceDist) <= 0.02) {
            return raceNames[raceDist];
        }
    }

    return "";
}

module.exports = {
    isRace, 
    detectRaceType
  };
  