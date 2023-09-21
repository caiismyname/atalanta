"use strict";

const ct = require("cholesky-tools");
const ln2pi = Math.log(2*Math.PI);
const isDebugging = false;

module.exports = class {
  constructor({weights, means, covariances, bufferSize}) {
    this.dimensions = means[0].length;
    this.clusters = means.length;
    this.weights = weights ? weights.slice() : Array(this.clusters).fill(1/this.clusters);
    this.means = means.map((mu) => mu.slice());
    this.covariances = covariances.map((cov) => cov.map((row) => row.slice()));
    this.bufferSize = bufferSize != null ? bufferSize : 1e6;

    this.data = Array(this.bufferSize);
    this.idx = 0; // index of the next data point
    this.dataLength = 0;

    // 'tmpArr' will hold sums of cluster resp., and inverses of those sums
    this.tmpArr = new Float32Array(this.bufferSize);

    // cluster responsibilities cResps[cluster_idx][data_idx]
    this.cResps = Array(this.clusters);
    for (let k=0; k<this.clusters; k++) {
      this.cResps[k] = new Float32Array(this.bufferSize);
    }

    this.singularity = null;

    this.covCholeskies = null; // Choleskies = plural of Cholesky :)
    this.covDeterminants = this.covariances.map((cov) => ct.determinant(cov));
  }

  addPoint(point) {
    this.data[this.idx] = point;
    this.idx++;
    if (this.idx == this.bufferSize) this.idx = 0;
    if (this.dataLength < this.bufferSize) this.dataLength++;
  }

  runEM(iterations = 1) {
    if (this.dataLength==0) return;
    for (let i=0; i<iterations; i++) {
      this.runExpectation();
      this.runMaximization();

      // calculate Cholesky decompositions of covariances
      if (this.dimensions > 3) {
        this.covCholeskies = Array(this.clusters);
        for (let k=0; k<this.clusters; k++) {
          this.covCholeskies[k] = ct.cholesky(this.covariances[k]);
        }
      }

      // calculate determinants of covariances
      for (let k=0; k<this.clusters; k++) {
        const L = this.covCholeskies && this.covCholeskies[k];
        this.covDeterminants[k] = ct.determinant(this.covariances[k], L);
      }

      // console.log("covDet pre mod", this.covDeterminants);

      // detect singularities
      for (let k=0; k<this.clusters; k++) {
        if (isDebugging) {
          console.log(`Checking cluster ${k}`);
          console.log("\tCluster mean", this.means[k]);
          console.log("\tCluster covar", this.covariances[k]);
        }

        if (this.covDeterminants[k] <= 0) {
          this.singularity = this.means[k];

          for (let idx = 0; idx < this.means[k].length; idx++) {
            this.means[k][idx] += 1e-6;
          }

          // this.covariances[k][0][1] = 1e-6
          // this.covariances[k][0][0] = 2e-6
          // this.covariances[k][1][0] = 3e-6
          // this.covariances[k][1][1] = 4e-6;

          this.covariances[k][0][0] *= 1.25;
          this.covariances[k][0][1] *= 1.202;
          this.covariances[k][1][0] *= 1.200;
          this.covariances[k][1][1] *= 1.204;

          if (isDebugging) {
            console.log(`\tCLUSTER ${k} is singular`);
            console.log("\tPost mod mean", this.means[k]);
            console.log(`\tPost mod covar`, this.covariances[k]);
          }


          // recalculate determinants of covariances
          for (let k=0; k<this.clusters; k++) {
            const L = this.covCholeskies && this.covCholeskies[k];
            this.covDeterminants[k] = ct.determinant(this.covariances[k], L);
          }

          // double check
          if (isDebugging) {
            if (this.covDeterminants[k] <= 0) {
              console.debug("\tstill singular");
            } else {
              console.debug("\tno longer singular");
            }
          }
          // return this.singularity;
        }
      }
      // console.log("cov det post mod", this.covDeterminants);
    }
  }

  predict(point) {
    const resps = Array(this.clusters);
    for (let k=0; k<this.clusters; k++) {
      const weight = this.weights[k];
      const mean = this.means[k];
      const cov = this.covariances[k];
      const covDet = this.covDeterminants[k];
      const covCholesky = this.covCholeskies && this.covCholeskies[k];

      // console.log("PDF", pdf(point, mean, cov, covDet, covCholesky))
      resps[k] = weight * this.pdf(point, mean, cov, covDet, covCholesky);
    }
    return resps;
  }

  predictNormalize(point) {
    const resps = this.predict(point);
    let s = 0;
    for (let k=0; k<this.clusters; k++) s += resps[k];
    const sInv = 1/s;
    for (let k=0; k<this.clusters; k++) resps[k] *= sInv;
    return resps;
  }

  runExpectation() {
    this.tmpArr.fill(0, 0, this.dataLength);
    for (let k=0; k<this.clusters; k++) {
      const resps = this.cResps[k];
      const weight = this.weights[k];
      const mean = this.means[k];
      const cov = this.covariances[k];
      const covDet = this.covDeterminants[k];
      const covCholesky = this.covCholeskies && this.covCholeskies[k];

      for (let i=0; i<this.dataLength; i++) {
        this.tmpArr[i] += resps[i] = weight * this.pdf(this.data[i], mean, cov, covDet, covCholesky);
      }
    }

    for (let i=0; i<this.dataLength; i++) this.tmpArr[i] = 1/this.tmpArr[i];

    for (let k=0; k<this.clusters; k++) {
      const resps = this.cResps[k];
      for (let i=0; i<this.dataLength; i++) {
        resps[i] *= this.tmpArr[i];
      }
    }
  }

  runMaximization() {
    for (let k=0; k<this.clusters; k++) {
      const resps = this.cResps[k];

      // soft count of data points in this cluster
      let softCount = 0;
      for (let i=0; i<this.dataLength; i++) {
        softCount += resps[i];
      }
      const scInv = 1/softCount;

      // weights
      this.weights[k] = softCount / this.dataLength;

      // means
      const mean = this.means[k].fill(0);
      for (let i=0; i<this.dataLength; i++) {
        for (let t=0; t<this.dimensions; t++) {
          mean[t] += resps[i]*this.data[i][t];
        }
      }
      for (let t=0; t<this.dimensions; t++) mean[t] *= scInv;

      // covariances
      const cov = this.covariances[k];
      for (let t=0; t<this.dimensions; t++) cov[t].fill(1e-6);

      const diff = Array(this.dimensions);
      for (let i=0; i<this.dataLength; i++) {
        const datum = this.data[i];

        for (let t=0; t<this.dimensions; t++) {
          diff[t] = datum[t] - mean[t];
        }

        for (let t1=0; t1<this.dimensions; t1++) {
          for (let t2=0; t2<this.dimensions; t2++) {
            cov[t1][t2] += resps[i]*diff[t1]*diff[t2];
          }
        }
      }
      for (let t1=0; t1<this.dimensions; t1++) {
        for (let t2=0; t2<this.dimensions; t2++) {
          cov[t1][t2] *= scInv;
        }
      }
    }
  }


  pdf(x, mean, cov, covDet, covCholesky) { // probability density function
    // covDet and covCholesky are optional parameters
    const d = typeof x == "number" ? 1 : x.length;
    const L = covCholesky || (d>3 ? ct.cholesky(cov) : null);
    const detInv = covDet != null ? 1/covDet : 1/ct.determinant(cov, L);
    const mah2 = this.xmuAxmu(ct.inverse(cov, L), mean, x); // mahalanobis^2

    // console.log(covDet, detInv, mah2);

    return Math.sqrt(detInv) * Math.exp(-.5*(mah2 + d*ln2pi));
  }

  xmuAxmu(A, mu, x) { // calculate (x-mu)'*A*(x-mu)
    if (typeof x == "number") return A*(x-mu)*(x-mu);
    else if (x.length==1) return A[0][0]*(x[0]-mu[0])*(x[0]-mu[0]);
    else if (x.length==2) {
      const d0 = x[0]-mu[0]; const d1 = x[1]-mu[1];
      return A[0][0]*d0*d0 + (A[0][1]+A[1][0])*d0*d1 + A[1][1]*d1*d1;
    }
    let s = 0; const n = x.length;
    let i; let j;
    for (i=0; i<n; i++) {
      for (j=0; j<n; j++) {
        s += A[i][j]*(x[i]-mu[i])*(x[j]-mu[j]);
      }
    }
    return s;
  }
};

/**
MIT License

Original Creator: Luka Popijac

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
