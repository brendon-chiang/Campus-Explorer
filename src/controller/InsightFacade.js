"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const JSZip = require("jszip");
const parse5 = require("parse5");
const url_1 = require("url");
const IInsightFacade_1 = require("./IInsightFacade");
const InsightCourse_1 = require("./InsightCourse");
const InsightRoom_1 = require("./InsightRoom");
const Util_1 = require("../Util");
class InsightFacade {
    addDataset(id, content, kind) {
        return __awaiter(this, void 0, void 0, function* () {
            const fs = require("fs");
            let existedData = "exists";
            const idname = id + ".json";
            const that = this;
            const toCheckValidID = "./test/data/" + id + ".zip";
            fs.readdirSync(__dirname).forEach(function (file) {
                if (file === idname) {
                    existedData = file;
                }
            });
            if (existedData === idname) {
                return Promise.reject({ code: 400, body: { result: "Dataset already exists." } });
            }
            if (existedData !== idname) {
                const zip = new JSZip();
                return zip.loadAsync(content, { base64: true }).then(function (zipfile) {
                    return Promise.resolve(zipfile);
                }).then(function (zipfile) {
                    const buffArr = [];
                    if (kind === IInsightFacade_1.InsightDatasetKind.Courses) {
                        zipfile.folder("courses").forEach(function (relativePath, infile) {
                            if (!infile.dir) {
                                if ((!infile.name.match("_")) && infile.name.match("courses/")) {
                                    const buffer = zipfile.file(infile.name).async("binarystring");
                                    buffArr.push(buffer);
                                }
                            }
                        });
                        return Promise.all(buffArr);
                    }
                    if (kind === IInsightFacade_1.InsightDatasetKind.Rooms) {
                        const dataArray = [];
                        const nameToSearch = new RegExp("index.htm");
                        const indexFile = zipfile.file(nameToSearch);
                        for (const item of indexFile) {
                            if (item.name === "rooms/index.htm") {
                                const indexContent = item.async("binarystring");
                                dataArray.push(indexContent);
                            }
                        }
                        const roomFolderName = new RegExp("rooms/campus/discover/buildings-and-classrooms");
                        const roomFolder = zipfile.file(roomFolderName).forEach(function (eachFile) {
                            const filterOut = new RegExp("._");
                            if (!filterOut.test(eachFile.name)) {
                                const roomFile = eachFile.async("binarystring");
                                dataArray.push(roomFile);
                            }
                        });
                        return Promise.all(dataArray);
                    }
                }).then(function (dataArray) {
                    return __awaiter(this, void 0, void 0, function* () {
                        let dataList = [];
                        if (kind === "courses") {
                            for (const obj of dataArray) {
                                const json = JSON.parse(obj);
                                const s = json.result;
                                let sec;
                                if ((s.length !== 0) && (s !== undefined)) {
                                    for (const m of s) {
                                        if (m.Section === "overall") {
                                            sec = new InsightCourse_1.InsightCourse(m.Subject, m.Course, m.Avg, m.Professor, m.Title, m.Pass, m.Fail, m.Audit, m.id.toString(), 1900);
                                        }
                                        else {
                                            sec = new InsightCourse_1.InsightCourse(m.Subject, m.Course, m.Avg, m.Professor, m.Title, m.Pass, m.Fail, m.Audit, m.id.toString(), m.Year);
                                        }
                                        dataList.push(sec);
                                    }
                                }
                            }
                        }
                        if (kind === "rooms") {
                            const document = parse5.parse(dataArray[0], { treeAdapter: parse5.treeAdapters.htmlparser2 });
                            const parserTree = parse5.treeAdapters.htmlparser2;
                            const i = that.searchNode(document, "tbody");
                            const nodeList = [];
                            for (const eachChild of i.children) {
                                if (eachChild.nodeType === 1) {
                                    nodeList.push(eachChild);
                                }
                            }
                            const fileArray = [];
                            for (const eachFile of dataArray) {
                                const roomfile = parse5.parse(eachFile, { treeAdapter: parse5.treeAdapters.htmlparser2 });
                                fileArray.push(roomfile);
                            }
                            dataList = yield that.buildingObj(nodeList, fileArray, dataList);
                        }
                        return Promise.all(dataList);
                    });
                }).then(function (courseList) {
                    if (courseList.length === 0) {
                        Util_1.default.trace("empty array");
                        return Promise.reject({ code: 400, body: { result: "Dataset failed to load." } });
                    }
                    else {
                        fs.writeFileSync("./src/controller/" + id + ".json", JSON.stringify(courseList));
                        const datasetInfo = new IInsightFacade_1.InsightDataset(id, kind, courseList.length);
                        fs.writeFileSync("./src/controller/" + "datasetList_" + id + ".json", JSON.stringify(datasetInfo));
                        Promise.resolve(fs);
                        return Promise.resolve({ code: 204, body: { result: "Dataset loaded." } });
                    }
                }).catch(function (e) {
                    Util_1.default.trace("unexpected error");
                    return Promise.reject({ code: 400, body: { result: "Dataset failed to load." } });
                });
            }
        });
    }
    checkRooms(fullName, buildingInfo, fileArray, dataList) {
        let theBuilding = null;
        for (const eachFile of fileArray) {
            const name = this.searchAttr(eachFile, "field-content");
            if (name === fullName) {
                theBuilding = eachFile;
                break;
            }
        }
        const roomsNode = this.searchNode(theBuilding, "tbody");
        if (roomsNode !== null && roomsNode !== undefined) {
            theBuilding = this.searchNode(theBuilding, "tbody");
            const nodeList = [];
            for (const eachChild of theBuilding.children) {
                if (eachChild.nodeType === 1) {
                    nodeList.push(eachChild);
                }
            }
            for (const eachRoom of nodeList) {
                const num = this.searchAttr(eachRoom, "views-field views-field-field-room-number");
                const name = buildingInfo.shortname + "_" + num;
                const seats = this.searchAttr(eachRoom, "views-field views-field-field-room-capacity");
                const furniture = this.searchAttr(eachRoom, "views-field views-field-field-room-furniture");
                const type = this.searchAttr(eachRoom, "views-field views-field-field-room-type");
                const href = this.searchAttr(eachRoom, "views-field views-field-nothing");
                const newRoom = new InsightRoom_1.InsightRoom(buildingInfo.fullname, buildingInfo.shortname, buildingInfo.address, buildingInfo.geoLocation, type, name, num, seats, furniture, href);
                dataList.push(newRoom);
            }
            return dataList;
        }
        else {
            return null;
        }
    }
    searchNode(nodeToSearch, nodeName) {
        const parser = parse5.treeAdapters.htmlparser2;
        const name = parser.getTagName(nodeToSearch);
        if (name === nodeName) {
            return nodeToSearch;
        }
        else {
            if (Array.isArray(nodeToSearch.children)) {
                for (const eachChild of nodeToSearch.children) {
                    const result = this.searchNode(eachChild, nodeName);
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                }
            }
            else {
                return null;
            }
        }
    }
    searchData(nodeToSearch) {
        const parser = parse5.treeAdapters.htmlparser2;
        if (nodeToSearch.nodeType === 3 && nodeToSearch.data.trim().length !== 0) {
            return nodeToSearch.data.trim();
        }
        else {
            if (Array.isArray(nodeToSearch.children)) {
                for (const eachChild of nodeToSearch.children) {
                    const result = this.searchData(eachChild);
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                }
            }
            else {
                return null;
            }
        }
    }
    searchAttr(nodeToSearch, attr) {
        const parser = parse5.treeAdapters.htmlparser2;
        const name = parser.getAttrList(nodeToSearch);
        let val = null;
        if (Array.isArray(name) && name.length > 0) {
            val = name[0].value;
        }
        if (val === attr) {
            return nodeToSearch;
        }
        else {
            if (Array.isArray(nodeToSearch.children)) {
                for (const eachChild of nodeToSearch.children) {
                    let result = this.searchAttr(eachChild, attr);
                    if (result !== null && result !== undefined) {
                        if (attr === "views-field views-field-nothing") {
                            result = result.children[1].attribs.href;
                        }
                        if (typeof result !== "string") {
                            result = this.searchData(result);
                        }
                        return result;
                    }
                }
            }
            else {
                return null;
            }
        }
    }
    removeDataset(id) {
        const fs = require("fs");
        const pathh = "./src/controller/" + id + ".json";
        try {
            fs.unlinkSync(pathh);
            Promise.resolve(fs);
            return Promise.resolve({ code: 204, body: { error: "The operation was successful." } });
        }
        catch (e) {
            return Promise.reject({ code: 404, body: { error: "The operation was unsuccessful." } });
        }
    }
    performQuery(query) {
        const fs = require("fs");
        let returnData;
        let queryData;
        const that = this;
        return new Promise(function (resolve, reject) {
            if (!query.hasOwnProperty("TRANSFORMATIONS")) {
                if (!that.validateQuery(query)) {
                    reject({ code: 400, body: { error: "Query is not formatted correctly" } });
                }
                if (!that.validateWhere(query["WHERE"])) {
                    reject({ code: 400, body: { error: "Invalid WHERE body" } });
                }
                if (!that.validateOption(query["OPTIONS"])) {
                    reject({ code: 400, body: { error: "Invalid OPTIONS body" } });
                }
            }
            else {
                if (!that.validateTRANS(query["TRANSFORMATIONS"])) {
                    reject({ code: 400, body: { error: "Invalid TRANSFORMATION body" } });
                }
                const GroupKeys = query["TRANSFORMATIONS"]["GROUP"];
                const ApplyKeys = query["TRANSFORMATIONS"]["APPLY"];
                const applyStrings = [];
                for (const eachApplyKey of ApplyKeys) {
                    const applyString = Object.keys(eachApplyKey)[0];
                    applyStrings.push(applyString);
                }
                if (!that.validateTransformationOption(query, applyStrings, GroupKeys)) {
                    Util_1.default.trace("1");
                    reject({ code: 400, body: { error: "Invalid OPTIONS body" } });
                }
            }
            const filterKey = query["OPTIONS"]["COLUMNS"];
            let useKey = null;
            for (const eachKey of filterKey) {
                if (that.validateKeyString(eachKey) || that.validateKeyNum(eachKey) ||
                    that.validateRoomKeyString(eachKey) || that.validateRoomKeyNum(eachKey)) {
                    useKey = eachKey;
                }
            }
            const stringIndexforReplace = useKey.search("_");
            const stringforReplace = useKey.substr(0, stringIndexforReplace);
            if (fs.existsSync(__dirname + "/" + stringforReplace + ".json")) {
                returnData = fs.readFileSync(__dirname + "/" + stringforReplace + ".json");
                try {
                    returnData = returnData.toString();
                    queryData = JSON.parse(returnData);
                }
                catch (err) {
                    reject({ code: 400, body: { error: "Query invalid" } });
                }
            }
            else {
                reject({ code: 400, body: { error: "Dataset not available" } });
            }
            if (stringforReplace === "courses") {
                for (const checkKey of filterKey) {
                    if (that.validateRoomKeyNum(checkKey) || that.validateRoomKeyString(checkKey)) {
                        reject({ code: 400, body: { error: "Courses does not contain those keys" } });
                    }
                }
            }
            else if (stringforReplace === "rooms") {
                for (const checkKey of filterKey) {
                    if (that.validateKeyNum(checkKey) || that.validateKeyString(checkKey)) {
                        reject({ code: 400, body: { error: "Rooms does not contain those keys" } });
                    }
                }
            }
            const result = [];
            let resultArray = that.doTheComparators(query["WHERE"], queryData);
            const orderKey = query["OPTIONS"]["ORDER"];
            if (query.hasOwnProperty("TRANSFORMATIONS")) {
                if (resultArray.length !== 0) {
                    const GroupKeys = query["TRANSFORMATIONS"]["GROUP"];
                    const ApplyKeys = query["TRANSFORMATIONS"]["APPLY"];
                    if (orderKey !== undefined && orderKey !== null) {
                        const inGroups = that.grouping(resultArray, GroupKeys);
                        const afterApply = that.applyKeys(inGroups, ApplyKeys);
                        const pendingResult = that.selectTransformationOptions(afterApply, filterKey);
                        const columnsSyntax = query["OPTIONS"]["ORDER"];
                        if (Object.keys(columnsSyntax)[0] === "dir") {
                            const directionPassed = query["OPTIONS"]["ORDER"]["dir"];
                            const transformOrderKeys = query["OPTIONS"]["ORDER"]["keys"];
                            const afterSort = that.sortBy(pendingResult, transformOrderKeys, directionPassed);
                            resolve({ code: 200, body: { result: afterSort } });
                        }
                        else {
                            const defaultSort = that.sortBy(pendingResult, orderKey, "UP");
                            resolve({ code: 200, body: { result: defaultSort } });
                        }
                    }
                    else {
                        const inGroups = that.grouping(resultArray, GroupKeys);
                        const afterApply = that.applyKeys(inGroups, ApplyKeys);
                        const pendingResult = that.selectTransformationOptions(afterApply, filterKey);
                        resolve({ code: 200, body: { result: pendingResult } });
                    }
                }
            }
            else {
                resultArray = that.selectOptions(resultArray, filterKey);
                if (resultArray.length !== 0) {
                    if (query["OPTIONS"].hasOwnProperty("ORDER")) {
                        if (query["OPTIONS"]["ORDER"].hasOwnProperty("dir")) {
                            const direction = query["OPTIONS"]["ORDER"]["dir"];
                            const deepOrderKey = query["OPTIONS"]["ORDER"]["keys"];
                            resultArray = that.sortBy(resultArray, deepOrderKey, direction);
                        }
                        else {
                            resultArray = that.sortBy(resultArray, orderKey, "UP");
                        }
                    }
                    else {
                        resolve({ code: 200, body: { result: resultArray } });
                    }
                }
                resolve({ code: 200, body: { result: resultArray } });
            }
        });
    }
    sortBy(resultArray, orderKeys, direction) {
        if (typeof orderKeys === "string") {
            orderKeys = [orderKeys];
        }
        const directionNum = direction === "DOWN" ? -1 : 1;
        return resultArray.sort(function compare(a, b) {
            for (const key of orderKeys) {
                if (a[key] > b[key]) {
                    return directionNum;
                }
                else if (a[key] < b[key]) {
                    return -directionNum;
                }
            }
            return 0;
        });
    }
    filterNode(toFilter) {
        const nodeList = [];
        for (const eachChild of toFilter.children) {
            if (eachChild.nodeType === 1) {
                nodeList.push(eachChild);
            }
        }
        return nodeList;
    }
    buildingObj(nodeList, fileArray, dataList) {
        return __awaiter(this, void 0, void 0, function* () {
            const parser = parse5.treeAdapters.htmlparser2;
            let buildRooms = [];
            for (const eachBuilding of nodeList) {
                const att = parser;
                const fullname = this.searchAttr(eachBuilding, "views-field views-field-title");
                const shortname = this.searchAttr(eachBuilding, "views-field views-field-field-building-code");
                const address = this.searchAttr(eachBuilding, "views-field views-field-field-building-address");
                let geoLocation;
                const encodedAddress = address.replace(/\s/g, "%20");
                const toSend = new url_1.URL("http://skaha.cs.ubc.ca:11316/api/v1/team69/" + encodedAddress);
                const Http = require("http");
                try {
                    geoLocation = yield new Promise(function (resolve, reject) {
                        Http.get(toSend, function (response) {
                            Util_1.default.trace("Calling Http.get");
                            response.setEncoding("utf8");
                            let data = "";
                            response.on("data", (chunk) => {
                                data += chunk;
                            });
                            response.on("end", () => {
                                try {
                                    const body = JSON.parse(data);
                                    if (Object.keys(body).length === 1 || response.statusCode !== 200) {
                                        reject("error");
                                    }
                                    else {
                                        const result = { lat: body.lat, lon: body.lon };
                                        Util_1.default.trace(JSON.stringify(result));
                                        resolve(result);
                                    }
                                }
                                catch (e) {
                                    const result = { error: e };
                                    reject(result);
                                }
                            });
                        });
                    });
                }
                catch (err) {
                    Util_1.default.trace(err);
                }
                const building = new InsightRoom_1.InsightRoom(fullname, shortname, address, geoLocation);
                buildRooms = this.checkRooms(fullname, building, fileArray, dataList);
            }
            if (buildRooms !== null) {
                return buildRooms;
            }
            else {
                buildRooms = [];
                return buildRooms;
            }
        });
    }
    grouping(res, groupKey) {
        const wholeThing = new Map();
        const that = this;
        wholeThing.set("notGrouped", res);
        let toPassIn = wholeThing;
        for (const eachKey of groupKey) {
            const stringIndexforData = eachKey.search("_");
            const stringforData = eachKey.substr(stringIndexforData + 1);
            const inOne = new Map();
            toPassIn.forEach(function (value, key, map) {
                const singleGroupResult = that.groupingHelper(value, stringforData, key);
                singleGroupResult.forEach(function (v, k, m) {
                    inOne.set(k, v);
                });
            });
            toPassIn = inOne;
        }
        return toPassIn;
    }
    groupingHelper(passIn, eachKey, groupedKey) {
        const valueGroup = new Map();
        let oneGroup = passIn[0][eachKey];
        if (oneGroup === null || oneGroup === undefined) {
            oneGroup = eachKey + " unavailable";
        }
        if (groupedKey !== "notGrouped") {
            oneGroup = oneGroup + "_" + groupedKey;
            valueGroup.set(oneGroup, []);
            for (const result of passIn) {
                let toGroupValue = result[eachKey];
                if (toGroupValue === null || toGroupValue === undefined || toGroupValue === "") {
                    toGroupValue = eachKey + " unavailable";
                }
                if (!valueGroup.has(toGroupValue + "_" + groupedKey)) {
                    const anotherGroup = toGroupValue + "_" + groupedKey;
                    valueGroup.set(anotherGroup, [result]);
                }
                else {
                    valueGroup.get(toGroupValue + "_" + groupedKey).push(result);
                }
            }
        }
        else {
            valueGroup.set(oneGroup, []);
            for (const result of passIn) {
                let toGroupValue = result[eachKey];
                if (toGroupValue === null || toGroupValue === undefined) {
                    toGroupValue = eachKey + " unavailable";
                }
                if (!valueGroup.has(toGroupValue)) {
                    const anotherGroup = toGroupValue;
                    valueGroup.set(anotherGroup, [result]);
                }
                else {
                    valueGroup.get(toGroupValue).push(result);
                }
            }
        }
        return valueGroup;
    }
    applyKeys(res, applykeys) {
        for (const eachApplyKey of applykeys) {
            const applyString = Object.keys(eachApplyKey)[0];
            const applyToken = Object.keys(eachApplyKey[applyString])[0];
            const applyitem = eachApplyKey[applyString][applyToken];
            const stringIndexforData = applyitem.search("_");
            const stringforData = applyitem.substr(stringIndexforData + 1);
            switch (applyToken) {
                case "MAX":
                    res.forEach(function (value, key, map) {
                        let max = value[0][stringforData];
                        for (const eachResult of value) {
                            if (eachResult[stringforData] >= max) {
                                max = Number(eachResult[stringforData]);
                            }
                        }
                        for (const eachResult of value) {
                            eachResult[applyString] = max;
                        }
                    });
                    break;
                case "MIN":
                    res.forEach(function (value, key, map) {
                        let min = value[0][stringforData];
                        for (const eachResult of value) {
                            if (eachResult[stringforData] <= min) {
                                min = Number(eachResult[stringforData]);
                            }
                        }
                        for (const eachResult of value) {
                            eachResult[applyString] = min;
                        }
                    });
                    break;
                case "AVG":
                    res.forEach(function (value, key, map) {
                        let sum = 0;
                        for (const eachResult of value) {
                            let eachAVG = Number(eachResult[stringforData]);
                            eachAVG = (eachAVG * 100);
                            sum = sum + eachAVG;
                        }
                        let avg = sum / value.length / 100;
                        avg = Number(avg.toFixed(2));
                        for (const eachResult of value) {
                            eachResult[applyString] = avg;
                        }
                    });
                    break;
                case "SUM":
                    res.forEach(function (value, key, map) {
                        let sum = 0;
                        for (const eachResult of value) {
                            const runSum = Number(eachResult[stringforData]);
                            sum = sum + runSum;
                        }
                        sum = Number(sum.toFixed(2));
                        for (const eachResult of value) {
                            eachResult[applyString] = sum;
                        }
                    });
                    break;
                case "COUNT":
                    res.forEach(function (value, key, map) {
                        const hasValues = [value[0][stringforData]];
                        let count = 1;
                        for (const eachResult of value) {
                            if (!hasValues.includes(eachResult[stringforData])) {
                                hasValues.push(eachResult[stringforData]);
                                count++;
                            }
                        }
                        for (const eachResult of value) {
                            eachResult[applyString] = count;
                        }
                    });
                    break;
            }
        }
        return res;
    }
    selectOptions(res, neededKey) {
        const datkeys = [];
        const forEdit = [];
        const datresults = [];
        for (const datkey of neededKey) {
            const stringIndexforData = datkey.search("_");
            const stringforData = datkey.substr(stringIndexforData + 1);
            const forTesting = "^" + stringforData + "$";
            forEdit.push(stringforData);
            datkeys.push(forTesting);
        }
        const keep = new RegExp(datkeys.join("|"));
        for (const result of res) {
            for (const ele of Object.keys(result)) {
                if (!keep.test(ele)) {
                    delete result[ele];
                }
            }
            let value = 0;
            if (neededKey[0].startsWith("courses_")) {
                const newObject = {};
                for (const curKey of forEdit) {
                    if (this.validateKeyNum(curKey)) {
                        value = Number(result[curKey]);
                        newObject[("courses_" + curKey).toString()] = value;
                    }
                    else {
                        value = result[curKey];
                        newObject[("courses_" + curKey).toString()] = value;
                    }
                }
                datresults.push(newObject);
            }
            else if (neededKey[0].startsWith("rooms_")) {
                const newObject = {};
                for (const curKey of forEdit) {
                    if (this.validateRoomKeyNum(curKey)) {
                        value = Number(result[curKey]);
                        newObject[("rooms_" + curKey).toString()] = value;
                    }
                    else {
                        value = result[curKey];
                        newObject[("rooms_" + curKey).toString()] = value;
                    }
                }
                datresults.push(newObject);
            }
        }
        return datresults;
    }
    selectTransformationOptions(res, neededKey) {
        const toArray = [];
        res.forEach(function (value, key, map) {
            toArray.push(value[0]);
        });
        const datkeys = [];
        const forEdit = [];
        const datresults = [];
        for (const datkey of neededKey) {
            const stringIndexforData = datkey.search("_");
            const stringforData = datkey.substr(stringIndexforData + 1);
            const forTesting = "^" + stringforData + "$";
            forEdit.push(stringforData);
            datkeys.push(forTesting);
        }
        const keep = new RegExp(datkeys.join("|"));
        for (const result of toArray) {
            for (const ele of Object.keys(result)) {
                if (!keep.test(ele)) {
                    delete result[ele];
                }
            }
            let resultEdit = JSON.stringify(result);
            let useKey = null;
            for (const eachKey of neededKey) {
                if (this.validateKeyString(eachKey) || this.validateKeyNum(eachKey) ||
                    this.validateRoomKeyNum(eachKey) || this.validateRoomKeyString(eachKey)) {
                    useKey = eachKey;
                }
            }
            for (const curKey of forEdit) {
                if (this.validateKeyNum(curKey) || this.validateKeyString(curKey) ||
                    this.validateRoomKeyString(curKey) || this.validateRoomKeyNum(curKey)) {
                    const stringIndexforReplace = useKey.search("_");
                    const stringforReplace = useKey.substr(0, stringIndexforReplace);
                    resultEdit = resultEdit.replace(curKey, stringforReplace + "_" + curKey);
                }
            }
            const finalR = JSON.parse(resultEdit);
            datresults.push(finalR);
        }
        return datresults;
    }
    doTheComparators(filter, data) {
        const toFilter = Object.keys(filter)[0];
        let keyObject;
        let keyString;
        let comparatorString;
        let stringIndexforData;
        let stringforData;
        let keyValue;
        let result = [];
        if (toFilter === ("AND" || "OR")) {
            keyObject = filter[toFilter];
            keyString = Object.keys(keyObject)[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = keyObject[keyString];
        }
        else {
            keyObject = filter;
            comparatorString = Object.keys(keyObject)[0];
            keyString = Object.keys(filter[comparatorString])[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = filter[comparatorString][keyString];
        }
        switch (toFilter) {
            case "LT":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue < keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "GT":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue > keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "EQ":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue === keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "AND":
                const getAnd = filter["AND"];
                let toStore = [];
                let i = 0;
                for (const getAndSingle of getAnd) {
                    i++;
                    if (i === 1) {
                        toStore = this.doTheComparators(getAndSingle, data);
                    }
                    else {
                        toStore = this.doTheComparators(getAndSingle, toStore);
                    }
                }
                result = toStore;
                break;
            case "OR":
                const getOR = filter["OR"];
                let childArray;
                for (const getORSingle of getOR) {
                    childArray = this.doTheComparators(getORSingle, data);
                    for (const obj of childArray) {
                        result.push(obj);
                    }
                }
                result = Array.from(new Set(result));
                break;
            case "IS":
                if (keyValue === "*" || keyValue === "**") {
                    result = data.slice();
                    return result;
                }
                else if (keyValue.startsWith("*") && keyValue.endsWith("*")) {
                    const middle = keyValue.substring(1, keyValue.length - 1);
                    result = data.filter((obj) => obj[stringforData].includes(middle));
                    return result;
                }
                else if (keyValue.startsWith("*")) {
                    const end = keyValue.substring(1, keyValue.length);
                    result = data.filter((obj) => obj[stringforData].endsWith(end));
                    return result;
                }
                else if (keyValue.endsWith("*")) {
                    const begin = keyValue.substring(0, keyValue.length - 1);
                    result = data.filter((obj) => obj[stringforData].startsWith(begin));
                    return result;
                }
                else {
                    result = data.filter((obj) => obj[stringforData] === keyValue);
                    return result;
                }
            case "NOT":
                const opposite = this.doTheComparators(filter["NOT"], data);
                result = data.filter((obj) => !opposite.includes(obj));
                break;
        }
        return result;
    }
    doTheTransformations(filter, data, result) {
        const toFilter = Object.keys(filter)[0];
        let keyObject;
        let keyString;
        let comparatorString;
        let stringIndexforData;
        let stringforData;
        let keyValue;
        if (toFilter === ("AND" || "OR")) {
            keyObject = filter[toFilter];
            keyString = Object.keys(keyObject)[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = keyObject[keyString];
        }
        else {
            keyObject = filter;
            comparatorString = Object.keys(keyObject)[0];
            keyString = Object.keys(filter[comparatorString])[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = filter[comparatorString][keyString];
        }
        switch (toFilter) {
            case "LT":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue < keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "GT":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue > keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "EQ":
                for (const dataFound of data) {
                    const dataString = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue = dataFound[dataString];
                    if (dataValue === keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "AND":
                const getAnd = filter["AND"];
                const copyofData = data.slice();
                let toStore;
                let i = 0;
                for (const getAndSingle of getAnd) {
                    i++;
                    if (i === 1) {
                        toStore = this.doTheComparators(getAndSingle, copyofData);
                    }
                    else {
                        toStore = this.doTheComparators(getAndSingle, toStore);
                    }
                }
                result = toStore;
                break;
            case "OR":
                const getOR = filter["OR"];
                let toStore2;
                const finalll = [];
                let m = 0;
                for (const getORSingle of getOR) {
                    m++;
                    if (m === 1) {
                        toStore2 = this.doTheComparators(getORSingle, data);
                        for (const mm of toStore2) {
                            finalll.push(mm);
                        }
                    }
                    else {
                        toStore2 = this.doTheComparators(getORSingle, data);
                        for (const mm of toStore2) {
                            finalll.push(mm);
                        }
                    }
                }
                result = finalll;
                break;
            case "IS":
                if (keyValue === "*" || keyValue === "**") {
                    result = data.slice();
                    return result;
                }
                else if (keyValue.startsWith("*") && keyValue.endsWith("*")) {
                    const middle = keyValue.substring(1, keyValue.length - 1);
                    result = data.filter((obj) => obj[stringforData].includes(middle));
                    return result;
                }
                else if (keyValue.startsWith("*")) {
                    const end = keyValue.substring(1, keyValue.length);
                    result = data.filter((obj) => obj[stringforData].endsWith(end));
                    return result;
                }
                else if (keyValue.endsWith("*")) {
                    const begin = keyValue.substring(0, keyValue.length - 1);
                    result = data.filter((obj) => obj[stringforData].startsWith(begin));
                    return result;
                }
                else {
                    result = data.filter((obj) => obj[stringforData] === keyValue);
                    return result;
                }
            case "NOT":
                const datacp = data.slice();
                const opposite = this.doTheComparators(filter["NOT"], data);
                if (opposite.length !== 0) {
                    for (const notwanted of opposite) {
                        let k = 0;
                        for (const item of datacp) {
                            if (notwanted === item) {
                                datacp.splice(k, 1);
                                break;
                            }
                            k++;
                        }
                    }
                    result = datacp;
                }
                else {
                    result = datacp;
                }
                break;
        }
        return result;
    }
    validateQuery(query) {
        return (query.hasOwnProperty("WHERE") && query.hasOwnProperty("OPTIONS"));
    }
    validateTRANS(query) {
        if (Object.keys(query)[0] !== "GROUP") {
            return false;
        }
        if (query[Object.keys(query)[0]].length < 1) {
            return false;
        }
        const transKey = query[Object.keys(query)[0]];
        for (const key of transKey) {
            if (!this.validateID(key) || !this.validateKey(key) ||
                (!this.validateKeyNum(key) && !this.validateKeyString(key) &&
                    !this.validateRoomKeyNum(key) && !this.validateRoomKeyString(key))) {
                return false;
            }
        }
        const applyKey = query["APPLY"];
        if (Object.keys(query)[1] !== null && Object.keys(query)[1] === "APPLY") {
            if (!this.validateApplyKey(applyKey)) {
                return false;
            }
        }
        return true;
    }
    validateApplyKey(applykey) {
        if (applykey.length !== 0) {
            const getInnerObj = Object.keys(applykey)[0];
            const applyString = Object.keys(applykey[getInnerObj])[0];
            const tokenObject = applykey[getInnerObj][applyString];
            const applyToken = Object.keys(tokenObject)[0];
            const checkKey = tokenObject[applyToken];
            switch (applyToken) {
                case "MAX":
                case "MIN":
                case "AVG":
                case "SUM":
                    return ((this.validateKeyNum(checkKey) || this.validateRoomKeyNum(checkKey)) &&
                        this.validateKey(checkKey) && this.validateID(checkKey));
                case "COUNT":
                    return (this.validateKey(checkKey) && this.validateID(checkKey));
            }
            return false;
        }
        return true;
    }
    validateKeyString(key) {
        const sDept = new RegExp("dept$");
        const sId = new RegExp("id$");
        const sUuid = new RegExp("uuid$");
        const sTitle = new RegExp("title$");
        const sInstructor = new RegExp("instructor$");
        return sDept.test(key) || sId.test(key) || sUuid.test(key) || sTitle.test(key) || sInstructor.test(key);
    }
    validateRoomKeyString(key) {
        const sFullName = new RegExp("fullname$");
        const sShortName = new RegExp("shortname$");
        const sNumber = new RegExp("number$");
        const sName = new RegExp("name$");
        const sAddress = new RegExp("address$");
        const sType = new RegExp("type$");
        const sFurniture = new RegExp("furniture$");
        const sHref = new RegExp("href$");
        return sFullName.test(key) || sShortName.test(key) || sNumber.test(key) || sName.test(key) ||
            sAddress.test(key) || sType.test(key) || sFurniture.test(key) || sHref.test(key);
    }
    validateKey(key) {
        const sKey = new RegExp("courses[_][a-z]*$");
        const sKeyR = new RegExp("rooms[_][a-z]*$");
        return sKey.test(key) || sKeyR.test(key);
    }
    validateKeyNum(key) {
        const sAvg = new RegExp("avg$");
        const sPass = new RegExp("pass$");
        const sFail = new RegExp("fail$");
        const sAudit = new RegExp("audit$");
        const sYear = new RegExp("year$");
        return (sAvg.test(key) || sPass.test(key) || sFail.test(key) || sAudit.test(key) || sYear.test(key));
    }
    validateRoomKeyNum(key) {
        const sLat = new RegExp("lat$");
        const sLon = new RegExp("lon$");
        const sSeats = new RegExp("seats$");
        return sLat.test(key) || sLon.test(key) || sSeats.test(key);
    }
    validateOption(query) {
        if (Object.keys(query)[0] !== "COLUMNS") {
            return false;
        }
        if (query[Object.keys(query)[0]].length < 1) {
            return false;
        }
        if (query.hasOwnProperty("ORDER")) {
            if (Object.keys(query["ORDER"])[0] !== "dir") {
                const orderKey = query[Object.keys(query)[1]];
                const columnsKey = query["COLUMNS"];
                for (const key of columnsKey) {
                    if (!this.validateID(key) || !this.validateKey(key) ||
                        (!this.validateKeyNum(key) && !this.validateKeyString(key) &&
                            !this.validateRoomKeyNum(key) && !this.validateRoomKeyString(key))) {
                        return false;
                    }
                }
            }
            else if (Object.keys(query["ORDER"])[0] === "dir") {
                if (query["ORDER"]["dir"] !== "UP" && query["ORDER"]["dir"] !== "DOWN") {
                    return false;
                }
                if (Object.keys(query["ORDER"])[1] !== "keys") {
                    return false;
                }
                for (const orderKeys of query["ORDER"]["keys"]) {
                    if (!this.validateID(orderKeys) || !this.validateKey(orderKeys) ||
                        (!this.validateKeyNum(orderKeys) && !this.validateKeyString(orderKeys) &&
                            !this.validateRoomKeyNum(orderKeys) && !this.validateRoomKeyString(orderKeys))) {
                        return false;
                    }
                }
            }
        }
        return true;
    }
    validateTransformationOption(query, applyKeys, groupKeys) {
        if (Object.keys(query["OPTIONS"])[0] !== "COLUMNS") {
            return false;
        }
        const columnKeys = query["OPTIONS"]["COLUMNS"];
        if (columnKeys.length < 1) {
            return false;
        }
        if (Object.keys(query["OPTIONS"])[1] !== undefined) {
            if (Object.keys(query["OPTIONS"])[1] !== "ORDER") {
                return false;
            }
            const orderKey = Object.keys(query["OPTIONS"]["ORDER"])[0];
            if (orderKey !== "0") {
                if (orderKey !== "dir") {
                    if (!this.validateID(orderKey) || !this.validateKey(orderKey) ||
                        (!this.validateKeyNum(orderKey) && !this.validateKeyString(orderKey) &&
                            !this.validateRoomKeyNum(orderKey) && !this.validateRoomKeyString(orderKey))) {
                        return false;
                    }
                }
                else if (orderKey === "dir") {
                    const dirKey = query["OPTIONS"]["ORDER"]["dir"];
                    if (dirKey !== "UP" && dirKey !== "DOWN") {
                        return false;
                    }
                    if (Object.keys(query["OPTIONS"]["ORDER"])[1] !== "keys") {
                        return false;
                    }
                    const applyObjects = query["TRANSFORMATIONS"]["APPLY"];
                    const applyStrings = [];
                    for (const applyObject of applyObjects) {
                        const applyString = Object.keys(applyObject);
                        applyStrings.push(applyString[0]);
                    }
                    for (const orderKeys of query["OPTIONS"]["ORDER"]["keys"]) {
                        if ((!this.validateID(orderKeys) || !this.validateKey(orderKeys) ||
                            (!this.validateKeyNum(orderKeys) && !this.validateKeyString(orderKeys) &&
                                !this.validateRoomKeyNum(orderKeys) && !this.validateRoomKeyString(orderKeys))) &&
                            !applyStrings.includes(orderKeys)) {
                            return false;
                        }
                    }
                }
            }
            else {
                const eachKey = query["OPTIONS"]["ORDER"];
                if (!this.validateID(eachKey) || !this.validateKey(eachKey) ||
                    (!this.validateKeyNum(eachKey) && !this.validateKeyString(eachKey) &&
                        !this.validateRoomKeyNum(eachKey) && !this.validateRoomKeyString(eachKey))) {
                    return false;
                }
            }
            return true;
        }
        const applyObjects2 = query["TRANSFORMATIONS"]["APPLY"];
        const applyStrings2 = [];
        for (const applyObject of applyObjects2) {
            const applyString2 = Object.keys(applyObject);
            applyStrings2.push(applyString2[0]);
        }
        for (const columnKeys2 of query["OPTIONS"]["COLUMNS"]) {
            if ((!this.validateID(columnKeys2) || !this.validateKey(columnKeys2) ||
                (!this.validateKeyNum(columnKeys2) && !this.validateKeyString(columnKeys2) &&
                    !this.validateRoomKeyNum(columnKeys2) && !this.validateRoomKeyString(columnKeys2))) &&
                !applyStrings2.includes(columnKeys2)) {
                return false;
            }
        }
        return true;
    }
    validateOrder(query, columnKey) {
        const orderKey = query[Object.keys(query)[1]];
        if (typeof orderKey === "string") {
            if (!columnKey.includes(orderKey)
                || !this.validateKey(orderKey) || !this.validateID(orderKey)) {
                return false;
            }
        }
        else {
            const dir = Object.keys(orderKey)[0];
            const order = Object.keys(orderKey)[1];
            if (dir === null || dir === undefined || order === null || order === undefined) {
                return false;
            }
            switch (dir) {
                case "UP":
                case "DOWN":
                    break;
                default:
                    return false;
            }
            const keys = orderKey[order]["keys"];
            for (const eachKey of keys) {
                if (!columnKey.includes(orderKey)
                    || !this.validateKey(orderKey) || !this.validateID(orderKey)) {
                    return false;
                }
            }
        }
        return true;
    }
    validateWhere(query) {
        const keys = Object.keys(query);
        const key = keys[0];
        let value = 0;
        switch (key) {
            case "AND":
            case "OR":
                const arrayOfBoolean = [];
                for (let i = 0; i < query[key].length; i++) {
                    arrayOfBoolean[i] = this.validateWhere(query[key][i]);
                    if (arrayOfBoolean[i] === false) {
                        return false;
                    }
                }
                if (arrayOfBoolean.length === 0) {
                    return false;
                }
                break;
            case "GT":
            case "LT":
            case "EQ":
                const key1 = Object.keys(query[key])[0];
                value = query[key][key1];
                if ((this.validateKeyNum(key1) || this.validateRoomKeyNum(key1)) &&
                    this.validateKey(key1) && this.validateID(key1)) {
                    return (typeof value === "number");
                }
                else {
                    return false;
                }
            case "IS":
                const key2 = Object.keys(query[key])[0];
                value = query[key][key2];
                if ((this.validateKeyString(key2) || this.validateRoomKeyString(key2))
                    && this.validateKey(key2) && this.validateID(key2)) {
                    if (typeof value !== "string") {
                        return false;
                    }
                    else if (value.substr(1, value.length - 2).includes("*")) {
                        return false;
                    }
                    else {
                        return true;
                    }
                }
                else {
                    return false;
                }
            case "NOT":
                const key3 = Object.keys(query[key])[0];
                switch (key3) {
                    case "AND":
                    case "OR":
                    case "GT":
                    case "LT":
                    case "EQ":
                    case "IS":
                    case "NOT":
                        return this.validateWhere(query[key]);
                }
            default:
                return false;
        }
        return true;
    }
    validateID(key) {
        const fs = require("fs");
        const stringIndexforReplace = key.search("_");
        const stringforReplace = key.substr(0, stringIndexforReplace);
        return (fs.existsSync(__dirname + "/" + stringforReplace + ".json"));
    }
    listDatasets() {
        const fs = require("fs");
        const dataSetList = [];
        const dataInfoPath = "./src/controller";
        const infoFileName = new RegExp("^datasetList_");
        fs.readdirSync(dataInfoPath).forEach(function (file) {
            if (infoFileName.test(file)) {
                const datasetAdd = JSON.parse(fs.readFileSync(dataInfoPath + "/" + file, "utf8"));
                const id = datasetAdd.id;
                const kind = datasetAdd.kind;
                const numRows = datasetAdd.numRows;
                const theResult = new IInsightFacade_1.InsightDataset(id, kind, numRows);
                dataSetList.push(theResult);
            }
        });
        const done = { result: dataSetList };
        return Promise.resolve({ code: 200, body: done });
    }
}
exports.default = InsightFacade;
//# sourceMappingURL=InsightFacade.js.map