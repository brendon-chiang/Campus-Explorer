"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var InsightDatasetKind;
(function (InsightDatasetKind) {
    InsightDatasetKind["Courses"] = "courses";
    InsightDatasetKind["Rooms"] = "rooms";
})(InsightDatasetKind = exports.InsightDatasetKind || (exports.InsightDatasetKind = {}));
class InsightDataset {
    constructor(id, kind, numRows) {
        this.id = id;
        this.id = id;
        this.kind = kind;
        this.numRows = numRows;
    }
}
exports.InsightDataset = InsightDataset;
//# sourceMappingURL=IInsightFacade.js.map