/**
 * Builds a query object using the current document object model (DOM).
 * Must use the browser's global document object {@link https://developer.mozilla.org/en-US/docs/Web/API/Document}
 * to read DOM information.
 *
 * @returns query object adhering to the query EBNF
 */
CampusExplorer.buildQuery = function() {
    let query = bodyBuilder();
    return query;
};

bodyBuilder = function() {
    var objArray = [];
    var returnObject = {};

    var active = document.getElementsByClassName("tab-panel active")[0];

    const numberOfConditionsFunction = active.getElementsByClassName("conditions-container")[0];
    let numberOfConditions = numberOfConditionsFunction.getElementsByClassName("control-group condition").length;
    let typeOfData = active.getAttribute("data-type");
    let dataTypeToPass = typeOfData + "_";

    smComparatorBuilder(objArray, numberOfConditions, dataTypeToPass, active);

    var controlCondition = active.getElementsByClassName("control-group condition-type")[0];
    if (objArray.length > 1) {
        objArray = logicComparatorBuilder(objArray, active);
    } else if (objArray.length === 1 && controlCondition.getElementsByTagName("input")[2].checked) {
        objArray = {"NOT": objArray[0]};
    } else if (objArray.length === 1) {
        objArray = objArray[0];
    } else {
        objArray = {};
    }
    returnObject["WHERE"] = objArray; // WHERE is built
    console.log(objArray);

    var optionKeyObject = [];
    returnObject["OPTIONS"] = optionsBuilder(optionKeyObject, numberOfConditions, dataTypeToPass, active);

    var transformationFinder = active.getElementsByClassName("transformations-container")[0];
    if (transformationFinder.getElementsByClassName("control-group transformation").length !== 0) {
        returnObject["TRANSFORMATIONS"] = transformationBuilder(numberOfConditions, dataTypeToPass, active);
    }
    return returnObject;
};

// Returns all the argument shit. GT, EQ, that crap. Lowest level stuff
smComparatorBuilder = function(objArray, numberOfConditions, dataTypeToPass, active) {
    for (i = 0; i < numberOfConditions; i++) {
        let getNegation = active.getElementsByClassName("control not")[i];
        let toNegate = getNegation.getElementsByTagName("input")[0].checked; // returns True if we need to NOT

        let getControlOperator = active.getElementsByClassName("control operators")[i];
        let smComparator = getControlOperator.getElementsByTagName("select")[0].value; //  "GT" of "GT" "course_avg":100

        let findInputValue = active.getElementsByClassName("control term")[i];
        let valueInputed = findInputValue.getElementsByTagName("input")[0].value; // "100" of GT" "course_avg":100

        let getSelectedKey = active.getElementsByClassName("control fields")[i];
        let selectedKey = getSelectedKey.getElementsByTagName("select")[0].value; // "courses_avg" of GT" course_avg:100

        if (smComparator !== "IS") {
            valueInputed = Number(valueInputed);
        }

        let obj = {
            [smComparator] : {
                [dataTypeToPass + selectedKey]: valueInputed
            }
        };
        if (toNegate) {
            obj = {"NOT": obj};
        }
        objArray.push(obj);
    }
    return objArray;
};

// Does the AND, OR, NOT shit
logicComparatorBuilder = function(object, active) {
    var controlCondition = active.getElementsByClassName("control-group condition-type")[0];

    // Means "All of the following" was checked. Add AND
    if (controlCondition.getElementsByTagName("input")[0].checked) {
        object = {"AND": object};
    }
    // Means "Any of the following" was checked. Add OR
    else if (controlCondition.getElementsByTagName("input")[1].checked) {
        object = {"OR": object};
    }
    // Means "None of the following" was checked. Add NOT OR
    else if (controlCondition.getElementsByTagName("input")[2].checked) {
        object = {
            "NOT": {
                "OR": object
            }
        };
    }
    return object;
};

// build option
optionsBuilder = function(optionKeyObject, numberOfConditions, dataTypeToPass, active) {
    var orderContains = {};
    var columnsPosition = Number(numberOfConditions + 1);
    var optionObject = {};
    columnsBuilder(optionKeyObject, columnsPosition, dataTypeToPass, active);
    if (orderByDown(active)) {
        orderContains["dir"] = "DOWN";
        orderContains["keys"] = orderBuilder(dataTypeToPass, active);
    } else {
        orderContains["dir"] = "UP";
        orderContains["keys"] = orderBuilder(dataTypeToPass, active);
    }
    optionObject["COLUMNS"] = optionKeyObject; //  {COLUMNS: ["avg", "dept", "id"]}
    if (orderBuilder(dataTypeToPass, active).length !== 0) {
        optionObject["ORDER"] = orderContains;
    }
    return optionObject;

};

columnsBuilder = function(optionKeyObject, columnsPosition, dataTypeToPass, active) {
    let columnsController = active.getElementsByClassName("control-group")[columnsPosition];
    let numberOfGivenColumns = columnsController.getElementsByClassName("control field").length;
    let numberOfCreatedColumns = columnsController.getElementsByClassName("control transformation").length;
    let maxNumberOfColumns = numberOfGivenColumns + numberOfCreatedColumns;
    for (i = 0; i < maxNumberOfColumns; i++) {
        if (columnsController.getElementsByTagName("input")[i].checked) {
            if (i < numberOfGivenColumns) {
                optionKeyObject.push(dataTypeToPass + columnsController.getElementsByTagName("input")[i].value);
            } else {
                optionKeyObject.push(columnsController.getElementsByTagName("input")[i].value);
            }
        }
    }
};

orderBuilder = function(dataTypeToPass, active) {
    let optionField = active.getElementsByClassName("control order fields")[0];
    let numberOfTotalOptions = optionField.getElementsByTagName("option").length;
    let numberOfGivenOptions = numberOfTotalOptions - optionField.getElementsByClassName("transformation").length;
    var keysArray = [];
    for (i = 0; i < numberOfTotalOptions; i++) {
        if (optionField.getElementsByTagName("option")[i].selected) {
            if (i < numberOfGivenOptions) {
                keysArray.push(dataTypeToPass + optionField.getElementsByTagName("option")[i].value);
            } else {
                keysArray.push(optionField.getElementsByTagName("option")[i].value);
            }
        }
    }
    return keysArray;
};

orderByDown = function(active) {
    let controlDescending = active.getElementsByClassName("control descending")[0];
    return controlDescending.getElementsByTagName("input")[0].checked;
};

transformationBuilder = function(numberOfConditions, dataTypeToPass, active) {
    let returnObject = {};
    var groupBuilderPosition = numberOfConditions + 3;
    returnObject["GROUP"] = groupBuilder(groupBuilderPosition, dataTypeToPass, active);
    returnObject["APPLY"] = applyTransformationBuilder(dataTypeToPass, active);
    return returnObject;
};

groupBuilder = function(groupBuilderPosition, dataTypeToPass, active) {
    var groupingMainClass = active.getElementsByClassName("control-group")[groupBuilderPosition];
    const numberOfPossibleGroups = groupingMainClass.getElementsByClassName("control field").length;

    var groupArray = [];
    for (i = 0; i < numberOfPossibleGroups; i++) {
        if (groupingMainClass.getElementsByTagName("input")[i].checked) {
            groupArray.push(dataTypeToPass + groupingMainClass.getElementsByTagName("input")[i].value);
        }
    }
    return groupArray;
};

applyTransformationBuilder = function(dataTypeToPass, active) {
    var transformationContainer = active.getElementsByClassName("transformations-container")[0];
    var maxNumberOfApplies = transformationContainer.getElementsByClassName("control-group transformation").length;

    var returnArray = [];

    for (i = 0; i < maxNumberOfApplies; i++) {
        let getControlOperator = transformationContainer.getElementsByClassName("control operators")[i];
        let chooseTransformation = getControlOperator.getElementsByTagName("select")[0].value; // COUNT/MAX/MIN/ETC

        let getSelectedKey = transformationContainer.getElementsByClassName("control fields")[i];
        let selectedKey = getSelectedKey.getElementsByTagName("select")[0].value; // Audit/UUID/ETC

        let findInputValue = transformationContainer.getElementsByClassName("control term")[i];
        let valueInputed = findInputValue.getElementsByTagName("input")[0].value; // Given name to the transformation

        let returnObj = {
            [valueInputed]: {
                [chooseTransformation]: dataTypeToPass + selectedKey
            }
        };
        returnArray.push(returnObj);
    }
    return returnArray;
};
