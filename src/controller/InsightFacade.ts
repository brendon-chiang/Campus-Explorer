/*/<reference path="IInsightFacade.ts"/>*/
import {IncomingMessage} from "http";
import * as JSZip from "jszip";
import * as parse5 from "parse5";
import {URL} from "url";
import {
    IInsightFacade, InsightDataset, InsightDatasetKind, InsightGeoResponse, InsightResponse, InsightResponseSuccessBody,
} from "./IInsightFacade";
import {InsightCourse} from "./InsightCourse";
import {InsightRoom} from "./InsightRoom";
import Log from "../Util";
import Decimal from "decimal.js";

/**
 * This is the main programmatic entry point for the project.
 */
export default class InsightFacade implements IInsightFacade {
    public async addDataset(id: string, content: string, kind: InsightDatasetKind): Promise<InsightResponse> {
        const fs = require("fs");
        // check if the dataset exists
        let existedData = "exists";
        const idname = id + ".json";
        const that = this;
        const toCheckValidID = "./test/data/" + id + ".zip";
        fs.readdirSync(__dirname).forEach(function (file: string) {
            if (file === idname) {
                existedData = file;
            }
        });
        if (existedData === idname) {
            return Promise.reject({code: 400, body: {result: "Dataset already exists."}});
        }
        if (existedData !== idname) {
            const zip = new JSZip();
            return zip.loadAsync(content, {base64: true}).then(function (zipfile): Promise<JSZip> {
                return Promise.resolve(zipfile);
            }).then(function (zipfile): Promise<any> {
                const buffArr: any[] = [];
                if (kind === InsightDatasetKind.Courses) {
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
                if (kind === InsightDatasetKind.Rooms) {
                    const dataArray: Array<Promise<any>> = [];
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
            }).then(async function (dataArray) {
                let dataList: any[] = [];
                if (kind === "courses") {
                    for (const obj of dataArray) {
                        const json = JSON.parse(obj);
                        const s = json.result;
                        let sec: InsightCourse;
                        if ((s.length !== 0) && (s !== undefined)) {
                            for (const m of s) {
                                if (m.Section === "overall") {
                                    sec = new InsightCourse(m.Subject, m.Course, m.Avg,
                                        m.Professor, m.Title, m.Pass, m.Fail, m.Audit, m.id.toString(), 1900);
                                } else {
                                    sec = new InsightCourse(m.Subject, m.Course, m.Avg,
                                        m.Professor, m.Title, m.Pass, m.Fail, m.Audit, m.id.toString(), m.Year);
                                }
                                dataList.push(sec);
                            }
                        }
                    }
                }
                if (kind === "rooms") {
                    const document = parse5.parse(dataArray[0],
                        {treeAdapter: parse5.treeAdapters.htmlparser2});
                    const parserTree = parse5.treeAdapters.htmlparser2;
                    const i = that.searchNode(document, "tbody");
                    const nodeList: Node[] = [];
                    for (const eachChild of i.children) {
                        if (eachChild.nodeType === 1) {
                            nodeList.push(eachChild);
                        }
                    }
                    const fileArray: any[] = [];
                    for (const eachFile of dataArray) {
                        const roomfile = parse5.parse(eachFile,
                            {treeAdapter: parse5.treeAdapters.htmlparser2});
                        fileArray.push(roomfile);
                    }
                    // put new Rooms in dataList
                    dataList = await that.buildingObj(nodeList, fileArray, dataList);
                }
                return Promise.all(dataList);
            }).then(function (courseList) {
                // jsonArr[]
                if (courseList.length === 0) {
                    Log.trace("empty array");
                    return Promise.reject({code: 400, body: {result: "Dataset failed to load."}});
                } else {
                    fs.writeFileSync("./src/controller/" + id + ".json", JSON.stringify(courseList));
                    const datasetInfo = new InsightDataset(id, kind, courseList.length);
                    fs.writeFileSync("./src/controller/" + "datasetList_" + id + ".json", JSON.stringify(datasetInfo));
                    Promise.resolve(fs);
                    return Promise.resolve({code: 204, body: {result: "Dataset loaded."}});
                }
            }).catch(function (e) {
                Log.trace("unexpected error");
                return Promise.reject({code: 400, body: {result: "Dataset failed to load."}});
            });
        }
    }

    public checkRooms(fullName: string, buildingInfo: InsightRoom, fileArray: any[], dataList: any[]): any {
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
            const nodeList: Node[] = [];
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
                const newRoom = new InsightRoom(buildingInfo.fullname, buildingInfo.shortname,
                    buildingInfo.address, buildingInfo.geoLocation,
                    type, name, num, seats, furniture, href);
                dataList.push(newRoom);
            }
            return dataList;
        } else {
            return null;
        }
    }

    public searchNode(nodeToSearch: any, nodeName: string): any {
        const parser = parse5.treeAdapters.htmlparser2;
        const name = parser.getTagName(nodeToSearch);
        if (name === nodeName) {
            return nodeToSearch;
        } else {
            if (Array.isArray(nodeToSearch.children)) {
                for (const eachChild of nodeToSearch.children) {
                    const result = this.searchNode(eachChild, nodeName);
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                }
            } else {
                return null;
            }
        }
    }

    public searchData(nodeToSearch: any): any {
        const parser = parse5.treeAdapters.htmlparser2;
        if (nodeToSearch.nodeType === 3 && nodeToSearch.data.trim().length !== 0) {
            return nodeToSearch.data.trim();
        } else {
            if (Array.isArray(nodeToSearch.children)) {
                for (const eachChild of nodeToSearch.children) {
                    const result = this.searchData(eachChild);
                    if (result !== null && result !== undefined) {
                        return result;
                    }
                }
            } else {
                return null;
            }
        }
    }

    public searchAttr(nodeToSearch: any, attr: any): any {
        const parser = parse5.treeAdapters.htmlparser2;
        const name = parser.getAttrList(nodeToSearch);
        let val: string = null;
        if (Array.isArray(name) && name.length > 0) {
            val = name[0].value;
        }
        if (val === attr) {
            return nodeToSearch;
        } else {
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
            } else {
                return null;
            }
        }
    }

    public removeDataset(id: string): Promise<InsightResponse> {
        const fs = require("fs");
        const pathh = "./src/controller/" + id + ".json";
        try {
            fs.unlinkSync(pathh);
            Promise.resolve(fs);
            return Promise.resolve({code: 204, body: {error: "The operation was successful."}});
        } catch (e) {
            return Promise.reject({code: 404, body: {error: "The operation was unsuccessful."}});
        }
    }

    // Adding comment for Autobot
    public performQuery(query: any): Promise<InsightResponse> {
        const fs = require("fs");
        let returnData: any;
        let queryData: any;
        const that = this;
        return new Promise(function (resolve, reject) {
            if (!query.hasOwnProperty("TRANSFORMATIONS")) {
                if (!that.validateQuery(query)) {
                    reject({code: 400, body: {error: "Query is not formatted correctly"}});
                }
                if (!that.validateWhere(query["WHERE"])) {
                    reject({code: 400, body: {error: "Invalid WHERE body"}});
                }
                if (!that.validateOption(query["OPTIONS"])) {
                    reject({code: 400, body: {error: "Invalid OPTIONS body"}});
                }
            } else {
                if (!that.validateTRANS(query["TRANSFORMATIONS"])) {
                    reject({code: 400, body: {error: "Invalid TRANSFORMATION body"}});
                }
                const GroupKeys = query["TRANSFORMATIONS"]["GROUP"]; // TODO: fix this
                const ApplyKeys = query["TRANSFORMATIONS"]["APPLY"];
                const applyStrings: any[] = [];
                for (const eachApplyKey of ApplyKeys) {
                    const applyString = Object.keys(eachApplyKey)[0]; // the string to add into the result
                    applyStrings.push(applyString);
                }
                if (!that.validateTransformationOption(query, applyStrings, GroupKeys)) {
                    Log.trace("1");
                    reject({code: 400, body: {error: "Invalid OPTIONS body"}});
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
                } catch (err) {
                    reject({code: 400, body: {error: "Query invalid"}});
                }
            } else {
                reject({code: 400, body: {error: "Dataset not available"}});
            }
            if (stringforReplace === "courses") {
                for (const checkKey of filterKey) {
                    if (that.validateRoomKeyNum(checkKey) || that.validateRoomKeyString(checkKey)) {
                        reject({code: 400, body: {error: "Courses does not contain those keys"}});
                    }
                }
            } else if (stringforReplace === "rooms") {
                for (const checkKey of filterKey) {
                    if (that.validateKeyNum(checkKey) || that.validateKeyString(checkKey)) {
                        reject({code: 400, body: {error: "Rooms does not contain those keys"}});
                    }
                }
            }
            const result: any[] = [];
            let resultArray = that.doTheComparators(query["WHERE"], queryData);
            const orderKey = query["OPTIONS"]["ORDER"];
            if (query.hasOwnProperty("TRANSFORMATIONS")) {
                if (resultArray.length !== 0) {
                    const GroupKeys = query["TRANSFORMATIONS"]["GROUP"];  // TODO: may need to move this
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
                            resolve({code: 200, body: {result: afterSort}});
                        } else {
                            const defaultSort = that.sortBy(pendingResult, orderKey, "UP");
                            resolve({code: 200, body: {result: defaultSort}});
                        }
                    } else {
                        const inGroups = that.grouping(resultArray, GroupKeys);
                        const afterApply = that.applyKeys(inGroups, ApplyKeys);
                        const pendingResult = that.selectTransformationOptions(afterApply, filterKey);
                        resolve({code: 200, body: {result: pendingResult}});
                    }
                }
            } else {
                resultArray = that.selectOptions(resultArray, filterKey);
                if (resultArray.length !== 0) {
                    if (query["OPTIONS"].hasOwnProperty("ORDER")) {
                        if (query["OPTIONS"]["ORDER"].hasOwnProperty("dir")) { // TODO: figure out more than direction
                            const direction = query["OPTIONS"]["ORDER"]["dir"];
                            const deepOrderKey = query["OPTIONS"]["ORDER"]["keys"];
                            resultArray = that.sortBy(resultArray, deepOrderKey, direction);
                        } else {
                            resultArray = that.sortBy(resultArray, orderKey, "UP");
                        }
                    } else {
                        resolve({code: 200, body: {result: resultArray}});
                    }
                }
                resolve({code: 200, body: {result: resultArray}});
            }
        });
    }
    public sortBy(resultArray: any, orderKeys: any, direction: string) {
        // TODO: make sure orderKeys is a string or array
        if (typeof orderKeys === "string") {
            orderKeys = [orderKeys];
        }
        // Possibility of not array or string
        const directionNum = direction === "DOWN" ? -1 : 1;
        return resultArray.sort(function compare(a: any, b: any) {
            for (const key of orderKeys) {
                if (a[key] > b[key]) {
                    return directionNum;
                } else if (a[key] < b[key]) {
                    return -directionNum;
                }
            }
            return 0;
        });
    }

    public filterNode(toFilter: any): Node[] {
        const nodeList: Node[] = [];
        for (const eachChild of toFilter.children) {
            if (eachChild.nodeType === 1) {
                nodeList.push(eachChild);
            }
        }
        return nodeList;
    }
    public async buildingObj(nodeList: any[], fileArray: any[], dataList: any[]): Promise<any[]> {
        const parser = parse5.treeAdapters.htmlparser2;
        let buildRooms: InsightRoom[] = [];
        for (const eachBuilding of nodeList) {
            const att = parser;
            const fullname = this.searchAttr(eachBuilding, "views-field views-field-title");
            const shortname = this.searchAttr(eachBuilding, "views-field views-field-field-building-code");
            const address = this.searchAttr(eachBuilding, "views-field views-field-field-building-address");
            // get GeoLocation
            let geoLocation;
            const encodedAddress = address.replace(/\s/g, "%20");
            const toSend = new URL("http://skaha.cs.ubc.ca:11316/api/v1/team69/" + encodedAddress);
            const Http = require("http");
            try {
                geoLocation =  await new Promise(function (resolve, reject) {
                    Http.get(toSend, function (response: IncomingMessage) {
                        Log.trace("Calling Http.get");
                        response.setEncoding("utf8");
                        let data = "";
                        response.on("data", (chunk: any) => {
                            data += chunk;
                        });
                        response.on("end", () => {
                            try {
                                const body = JSON.parse(data);
                                if (Object.keys(body).length === 1 || response.statusCode !== 200) {
                                    reject("error");
                                } else {
                                    const result: InsightGeoResponse = {lat: body.lat, lon: body.lon};
                                    Log.trace(JSON.stringify(result));
                                    resolve(result);
                                }
                            } catch (e) {
                                const result: InsightGeoResponse = {error: e};
                                reject(result);
                            }
                        });
                    });
                });
            } catch (err) {
                Log.trace(err);
            }
            const building = new InsightRoom(fullname, shortname, address, geoLocation);
            buildRooms = this.checkRooms(fullname, building, fileArray, dataList);
        }
        if (buildRooms !== null) {
            return buildRooms;
        } else {
            buildRooms = [];
            return buildRooms;
        }
    }
    public grouping (res: any[], groupKey: any[]): Map<any, any[]> {
        const wholeThing = new Map();
        const that = this;
        wholeThing.set("notGrouped", res);
        let toPassIn = wholeThing;
        for (const eachKey of groupKey) {
            const stringIndexforData = eachKey.search("_");
            const stringforData = eachKey.substr(stringIndexforData + 1);
            const inOne = new Map();
            // for each map pair, sort them on the key
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
    public groupingHelper (passIn: any[], eachKey: string, groupedKey: string) {
        const valueGroup = new Map();
        let oneGroup = passIn[0][eachKey];
        if (oneGroup === null || oneGroup === undefined) {
            oneGroup = eachKey + " unavailable";
        }
        if (groupedKey !== "notGrouped") {
            oneGroup = oneGroup + "_" + groupedKey;
            valueGroup.set(oneGroup, []);  // eg. 310, 1 section
            for (const result of passIn) {
                let toGroupValue = result[eachKey];
                if (toGroupValue === null || toGroupValue === undefined || toGroupValue === "") {
                    toGroupValue = eachKey + " unavailable";
                }
                // doesnt have that key, then need another pair
                if (!valueGroup.has(toGroupValue + "_" + groupedKey)) {
                    const anotherGroup = toGroupValue + "_" + groupedKey;
                    valueGroup.set(anotherGroup, [result]);  // e.g 320, 1 section
                } else {
                    // has the key, get the value, push it to the corresponding group, e.g. 310, 2 section
                    valueGroup.get(toGroupValue + "_" + groupedKey).push(result);
                }
            }
        } else {
            valueGroup.set(oneGroup, []);  // eg. 310, 1 section
            for (const result of passIn) {
                let toGroupValue = result[eachKey];
                if (toGroupValue === null || toGroupValue === undefined) {
                    toGroupValue = eachKey + " unavailable";
                }
                // doesnt have that key, then need another pair
                if (!valueGroup.has(toGroupValue)) {
                    const anotherGroup = toGroupValue;
                    valueGroup.set(anotherGroup, [result]);  // e.g 320, 1 section
                } else {
                    // has the key, get the value, push it to the corresponding group, e.g. 310, 2 section
                    valueGroup.get(toGroupValue).push(result);
                }
            }
        }
        return valueGroup;
    }
    public applyKeys (res: Map<any, any[]>, applykeys: any[]): any {
        for (const eachApplyKey of applykeys) {
            const applyString = Object.keys(eachApplyKey)[0]; // the string to add into the result
            const applyToken = Object.keys(eachApplyKey[applyString])[0];
            const applyitem = eachApplyKey[applyString][applyToken];
            const stringIndexforData = applyitem.search("_");
            const stringforData = applyitem.substr(stringIndexforData + 1);
            switch (applyToken) {
                case "MAX":
                    res.forEach(function (value: any[], key, map) {
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
                    res.forEach(function (value: any[], key, map) {
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
                    res.forEach(function (value: any[], key, map) {
                        let sum: number = 0;
                        for (const eachResult of value) {
                            let eachAVG: number = Number(eachResult[stringforData]);
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
                    res.forEach(function (value: any[], key, map) {
                        let sum: number = 0;
                        for (const eachResult of value) {
                            const runSum: number = Number(eachResult[stringforData]);
                            sum = sum + runSum;
                        }
                        sum = Number(sum.toFixed(2));
                        for (const eachResult of value) {
                            eachResult[applyString] = sum;
                        }
                    });
                    break;
                case "COUNT":
                    res.forEach(function (value: any[], key, map) {
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
    // TODO: this function times out :(
    public selectOptions(res: any[], neededKey: string[]): object[] {
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
                const newObject: any = {};
                for (const curKey of forEdit) {
                    if (this.validateKeyNum(curKey)) {
                        value = Number(result[curKey]);
                        newObject[("courses_" + curKey).toString()] = value;
                    } else {
                        value = result[curKey];
                        newObject[("courses_" + curKey).toString()] = value;
                    }
                }
                datresults.push(newObject);
            } else if (neededKey[0].startsWith("rooms_")) {
                const newObject: any = {};
                for (const curKey of forEdit) {
                    if (this.validateRoomKeyNum(curKey)) {
                        value = Number(result[curKey]);
                        newObject[("rooms_" + curKey).toString()] = value;
                    } else {
                        value = result[curKey];
                        newObject[("rooms_" + curKey).toString()] = value;
                    }
                }
                datresults.push(newObject);
            }
        }
        return datresults;
    }
    public selectTransformationOptions(res: Map<any, any[]>, neededKey: string[]): object[] {
        const toArray: any[] = [];
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

    public doTheComparators(filter: any, data: any): any {
        const toFilter = Object.keys(filter)[0];
        let keyObject; // OBJECT {EQ: }
        let keyString: string; // "courses_dept"
        let comparatorString: string; // "EQ"
        let stringIndexforData;
        let stringforData: string;
        let keyValue: any; // "cpsc"
        let result: any = [];
        if (toFilter === ("AND" || "OR")) {
            keyObject = filter[toFilter];
            keyString = Object.keys(keyObject)[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = keyObject[keyString];
        } else {
            keyObject = filter;
            comparatorString = Object.keys(keyObject)[0];
            keyString = Object.keys(filter[comparatorString])[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = filter[comparatorString][keyString];
        }
        switch (toFilter) {
            // MComparator
            case "LT":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue < keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "GT":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue > keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "EQ":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue === keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "AND":
                const getAnd: any = filter["AND"];
                let toStore = [];
                let i = 0;
                for (const getAndSingle of getAnd) {
                    i++;
                    if (i === 1) {
                        toStore = this.doTheComparators(getAndSingle, data);
                    } else {
                        toStore = this.doTheComparators(getAndSingle, toStore);
                    }
                }
                result = toStore;
                break;
            case "OR":
                const getOR: any = filter["OR"];
                let childArray;
                for (const getORSingle of getOR) {
                    childArray = this.doTheComparators(getORSingle, data);
                    for (const obj of childArray) {
                        result.push(obj);
                    }
                }
                result = Array.from(new Set(result));
                break;
            // SComparison
            case "IS":
                if (keyValue === "*" || keyValue === "**") {
                    result = data.slice(); // TODO: hopefully this returns everything
                    return result;
                } else if (keyValue.startsWith("*") && keyValue.endsWith("*")) {
                    const middle = keyValue.substring(1, keyValue.length - 1);
                    result = data.filter((obj: any) => obj[stringforData].includes(middle));
                    return result;
                } else if (keyValue.startsWith("*")) {
                    const end = keyValue.substring(1, keyValue.length);
                    result = data.filter((obj: any) => obj[stringforData].endsWith(end));
                    return result;
                } else if (keyValue.endsWith("*")) {
                    const begin = keyValue.substring(0, keyValue.length - 1);
                    result = data.filter((obj: any) => obj[stringforData].startsWith(begin));
                    return result;
                } else {
                    result = data.filter((obj: any) => obj[stringforData] === keyValue);
                    return result;
                }
            // Negation
            case "NOT":
                const opposite = this.doTheComparators(filter["NOT"], data);
                result = data.filter((obj: any) => !opposite.includes(obj));
                // if (opposite.length !== 0) {
                //     for (const notwanted of opposite) {
                //         let k = 0;
                //         for (const item of datacp) {
                //             if (notwanted === item) {
                //                 datacp.splice(k, 1);
                //                 break;
                //             }
                //             k++;
                //         }
                //     }
                //     result = datacp;
                // } else {
                //     result = datacp;
                // }
                break;
        }
        return result;
    }
    public doTheTransformations(filter: any, data: any, result: any): any {
        const toFilter = Object.keys(filter)[0];
        let keyObject; // OBJECT {EQ: }
        let keyString: string; // "courses_dept"
        let comparatorString: string; // "EQ"
        let stringIndexforData;
        let stringforData: string;
        let keyValue: any; // "cpsc"
        if (toFilter === ("AND" || "OR")) {
            keyObject = filter[toFilter];
            keyString = Object.keys(keyObject)[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = keyObject[keyString];
        } else {
            keyObject = filter;
            comparatorString = Object.keys(keyObject)[0];
            keyString = Object.keys(filter[comparatorString])[0];
            stringIndexforData = keyString.search("_");
            stringforData = keyString.substr(stringIndexforData + 1);
            keyValue = filter[comparatorString][keyString];
        }
        switch (toFilter) {
            // MComparator
            case "LT":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue < keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "GT":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue > keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "EQ":
                for (const dataFound of data) {
                    const dataString: string = Object.keys(dataFound).find(function (keys) {
                        return keys === stringforData;
                    });
                    const dataValue: number = dataFound[dataString];
                    if (dataValue === keyValue) {
                        result.push(dataFound);
                    }
                }
                break;
            case "AND":
                const getAnd: any = filter["AND"];
                const copyofData = data.slice();
                let toStore;
                let i = 0;
                for (const getAndSingle of getAnd) {
                    i++;
                    if (i === 1) {
                        toStore = this.doTheComparators(getAndSingle, copyofData);
                    } else {
                        toStore = this.doTheComparators(getAndSingle, toStore);
                    }
                }
                result = toStore;
                break;
            case "OR":
                const getOR: any = filter["OR"];
                let toStore2;
                const finalll: any [] = [];
                let m = 0;
                for (const getORSingle of getOR) {
                    m++;
                    if (m === 1) {
                        toStore2 = this.doTheComparators(getORSingle, data);
                        for (const mm of toStore2) {
                            finalll.push(mm);
                        }
                    } else {
                        toStore2 = this.doTheComparators(getORSingle, data);
                        for (const mm of toStore2) {
                            finalll.push(mm);
                        }
                    }
                }
                result = finalll;
                break;
            // SComparison
            case "IS":
                if (keyValue === "*" || keyValue === "**") {
                    result = data.slice(); // TODO: hopefully this returns everything
                    return result;
                } else if (keyValue.startsWith("*") && keyValue.endsWith("*")) {
                    const middle = keyValue.substring(1, keyValue.length - 1);
                    result = data.filter((obj: any) => obj[stringforData].includes(middle));
                    return result;
                } else if (keyValue.startsWith("*")) {
                    const end = keyValue.substring(1, keyValue.length);
                    result = data.filter((obj: any) => obj[stringforData].endsWith(end));
                    return result;
                } else if (keyValue.endsWith("*")) {
                    const begin = keyValue.substring(0, keyValue.length - 1);
                    result = data.filter((obj: any) => obj[stringforData].startsWith(begin));
                    return result;
                } else {
                    result = data.filter((obj: any) => obj[stringforData] === keyValue);
                    return result;
                }
            // Negation
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
                } else {
                    result = datacp;
                }
                break;
        }
        return result;
    }

    // Validate that the Query is formatted correctly
    public validateQuery(query: any): boolean {
        return (query.hasOwnProperty("WHERE") && query.hasOwnProperty("OPTIONS"));
    }
    public validateTRANS(query: any): boolean {
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
            // TODO: make sure validateApplyKey does the right thing
            if (!this.validateApplyKey(applyKey)) {
                return false;
            }
        }
        return true;
    }
    // TODO: APPLYKEY ::= '{' key ': {' APPLYTOKEN ':' key '}}'
    public validateApplyKey(applykey: any): boolean {
        if (applykey.length !== 0) {
            const getInnerObj = Object.keys(applykey)[0]; // 0
            const applyString = Object.keys(applykey[getInnerObj])[0]; // "maxSeats"
            const tokenObject = applykey[getInnerObj][applyString]; // {"MAX":"rooms_seats"}
            const applyToken = Object.keys(tokenObject)[0]; // MAX
            const checkKey = tokenObject[applyToken]; // rooms_seats
            // TODO: make sure to check applystring is indeed a string
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

    public validateKeyString(key: string): boolean {
        const sDept = new RegExp("dept$");
        const sId = new RegExp("id$");
        const sUuid = new RegExp("uuid$");
        const sTitle = new RegExp("title$");
        const sInstructor = new RegExp("instructor$");
        return sDept.test(key) || sId.test(key) || sUuid.test(key) || sTitle.test(key) || sInstructor.test(key);
    }
    public validateRoomKeyString(key: string): boolean {
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

    public validateKey(key: string): boolean {
        const sKey = new RegExp("courses[_][a-z]*$");
        const sKeyR = new RegExp("rooms[_][a-z]*$"); // idk if this is right
        return sKey.test(key) || sKeyR.test(key);
    }

    public validateKeyNum(key: string): boolean {
        const sAvg = new RegExp("avg$");
        const sPass = new RegExp("pass$");
        const sFail = new RegExp("fail$");
        const sAudit = new RegExp("audit$");
        const sYear = new RegExp("year$");
        return (sAvg.test(key) || sPass.test(key) || sFail.test(key) || sAudit.test(key) || sYear.test(key));
    }

    public validateRoomKeyNum(key: string): boolean {
        const sLat = new RegExp("lat$");
        const sLon = new RegExp("lon$");
        const sSeats = new RegExp("seats$");
        return sLat.test(key) || sLon.test(key) || sSeats.test(key);
    }
    public validateOption(query: any): boolean {
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
            } else if (Object.keys(query["ORDER"])[0] === "dir") {
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
    public validateTransformationOption(query: any, applyKeys: any[], groupKeys: any[]): boolean {
        // const GroupKeys = query["TRANSFORMATIONS"]["GROUP"];  // TODO: may need to move this
        // const ApplyKeys = query["TRANSFORMATIONS"]["APPLY"];
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
                } else if (orderKey === "dir") {
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
            } else {
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
    public validateOrder(query: any, columnKey: any[]): boolean {
        const orderKey = query[Object.keys(query)[1]];
        if (typeof orderKey === "string") {
            if (!columnKey.includes(orderKey)
                || !this.validateKey(orderKey) || !this.validateID(orderKey)) {
                return false;
            }
        } else {
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

    public validateWhere(query: any): boolean {
        const keys = Object.keys(query);
        const key = keys[0];
        let value: any = 0;
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
                const key1 = Object.keys(query[key])[0]; // "course_avg"
                value = query[key][key1];
                if ((this.validateKeyNum(key1) || this.validateRoomKeyNum(key1)) &&
                    this.validateKey(key1) && this.validateID(key1)) {
                    return (typeof value === "number");
                } else {
                    return false;
                }
            case "IS":
                const key2 = Object.keys(query[key])[0]; // "rooms_furniture"
                value = query[key][key2]; // "*Tables*"
                if ((this.validateKeyString(key2) || this.validateRoomKeyString(key2))
                    && this.validateKey(key2) && this.validateID(key2)) {
                    if (typeof value !== "string") {
                        return false;
                    } else if (value.substr(1, value.length - 2).includes("*")) {
                        return false;
                    } else {
                        return true;
                    }
                } else {
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
                return false;              // TODO: default?????
        }
        return true;
    }
    public validateID(key: string): boolean {
        const fs = require("fs");
        const stringIndexforReplace = key.search("_");
        const stringforReplace = key.substr(0, stringIndexforReplace);
        return (fs.existsSync(__dirname + "/" + stringforReplace + ".json"));
    }
    public listDatasets(): Promise<InsightResponse> {
        const fs = require("fs");
        const dataSetList: InsightDataset[] = [];
        const dataInfoPath = "./src/controller";
        const infoFileName = new RegExp("^datasetList_");
        fs.readdirSync(dataInfoPath).forEach(function (file: string) {
            if (infoFileName.test(file)) {
                const datasetAdd = JSON.parse(fs.readFileSync(dataInfoPath + "/" + file, "utf8"));
                const id = datasetAdd.id;
                const kind = datasetAdd.kind;
                const numRows = datasetAdd.numRows;
                const theResult = new InsightDataset(id, kind, numRows);
                dataSetList.push(theResult);
            }
        });
        const done: InsightResponseSuccessBody = {result: dataSetList};
        return Promise.resolve({code: 200, body: done});
    }
}
