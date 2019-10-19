// aiml.js, ported from aimlInterpreter by Joric, 2015
// - added utf8 support in regular expressions
// - removed filesystem
// - DomJS replaced with DOMParser

var storedVariableValues = {};
var botAttributes = {};
var lastWildCardValue = '';
var wildCardArray = [];
var domArray = [];
var domIndex = 0;
var isAIMLFileLoadingStarted = false;
var isAIMLFileLoaded = false;
var previousAnswer = '';
var aimlRegex='[A-Z|0-9|\u0410-\u042f|\\s]*[A-Z|0-9|\u0410-\u042f|\*|-]*[A-Z|0-9|\u0410-\u042f]*[!|.|?|\\s]*';

var AIMLInterpreter = function(botAttributesParam) {
  var self = this;

  // botAttributes contain things like name, age, master, gender...
  botAttributes = botAttributesParam;

  this.loadAIMLFilesIntoArray = function(fileArray) {
    isAIMLFileLoadingStarted = true;
    var fileIndex = 0;
    var readAIMLFile = function(file) {
      var req = new XMLHttpRequest();
      req.open("GET", file, true);
      req.onreadystatechange = function () {
      if (req.readyState == 4 && req.status == 200) {
          fileIndex++;
          var data = req.responseText;
          var parser = new DOMParser();
          var dom = parser.parseFromString(data, "application/xml");
          domArray[domIndex] = dom.childNodes[0];
          domIndex++;
          if(fileIndex < fileArray.length) {
              readAIMLFile(fileArray[fileIndex]);
          } else {
            console.log('AIML file is loaded!');
            isAIMLFileLoaded = true;
          }
        }
      };
      req.send();
    };
    readAIMLFile(fileArray[fileIndex]);
  };

  this.findAnswerInLoadedAIMLFiles = function(clientInput, cb) {
    if (isAIMLFileLoaded) {
      wildCardArray = [];
      var result = '';
      for (var i = 0; i < domArray.length; i++) {
        result = findCorrectCategory(clientInput, domArray[i].childNodes);
        if(result)
          break;
      }
      if(result)
          previousAnswer = result;
      cb(result, wildCardArray);
    } else {
      var findAnswerInLoadedAIMLFilesWrapper = function(clientInput, cb) {
          return function() { self.findAnswerInLoadedAIMLFiles(clientInput, cb); };
      };
      setTimeout(findAnswerInLoadedAIMLFilesWrapper(clientInput, cb), 1000);
    }
  };
}; // AIMLInterpreter

var findCorrectCategory = function(clientInput, domCategories) {

    //indexOfSetTagAmountWithWildCard indicates how many sets with wildcard occur so that those sets store the correct wildcard value
    var indexOfSetTagAmountWithWildCard = 0;
    var traverseThroughDomToFindMatchingPattern = function(categories) {
      for (var i = 0; i < categories.length; i++) {
        if (categories[i].nodeName === 'category') {
          var text = traverseThroughDomToFindMatchingPattern(categories[i].childNodes);
          if ( checkIfMessageMatchesPattern(clientInput, text) ) {
            if ( checkForThatMatching(categories[i].childNodes) ) {
              var text = findFinalTextInTemplateNode(categories[i].childNodes);
              if(text)
                  return text;
              break;
            }
          }
        } else if (categories[i].nodeName === 'pattern') {
            return resolveChildNodesInPatternNode(categories[i].childNodes);
        }
      }
    }

    var checkForThatMatching = function(categoryChildNodes) {
      for(var i = 0; i < categoryChildNodes.length; i++) {
        if(categoryChildNodes[i].nodeName === 'that') {
          //if the previous answer of the bot does not match the that-tag text, then return undefined!
          return categoryChildNodes[i].childNodes[0].nodeValue === previousAnswer;
        }
      }
      //if no that tag was found, everything 'fits'
      return true;
    }

    var resolveChildNodesInPatternNode = function(patternChildNodes) {
      var text = '';
      for(var i = 0; i < patternChildNodes.length; i++)
        switch ( patternChildNodes[i].nodeName ) {
          case "bot": text += botAttributes[patternChildNodes[i].getAttribute('name')]; break;
          case "get": text += storedVariableValues[patternChildNodes[i].getAttribute('name')]; break;
          case "set": text += patternChildNodes[i].childNodes[0].nodeValue; break;
          default:    text += patternChildNodes[i].nodeValue; break;
        }
      return text;
    }

    var findFinalTextInTemplateNode = function(childNodesOfTemplate) {
      for(var i = 0; i < childNodesOfTemplate.length; i++) {
        switch (childNodesOfTemplate[i].nodeName) {
          case "bot": case "get": case "set": case "sr": case "star": return resolveSpecialNodes(childNodesOfTemplate);
          case "template": return findFinalTextInTemplateNode(childNodesOfTemplate[i].childNodes);
          case "random":   return findFinalTextInTemplateNode([childNodesOfTemplate[i].childNodes[Math.floor(Math.random() * (childNodesOfTemplate[i].childNodes.length))]]);
          case "srai":     return findCorrectCategory(('' + childNodesOfTemplate[i].childNodes[0].nodeValue).toUpperCase(), domCategories);
          case "li":       return findFinalTextInTemplateNode(childNodesOfTemplate[i].childNodes);
          case "that":     break;
          case "pattern":  resolveSpecialNodes(childNodesOfTemplate[i].childNodes); continue;
          default:         return resolveSpecialNodes(childNodesOfTemplate); break;
        }
      }
    }

    var resolveSpecialNodes = function(innerNodes) {
        var text = '';

        //concatenate string of all node children - normal text, bot tags, get tags, set tags...
        for(var i = 0; i < innerNodes.length; i++) {

          switch (innerNodes[i].nodeName) {
            case "bot":  text += botAttributes[innerNodes[i].getAttribute('name')]; break;
            case "get":  text += storedVariableValues[innerNodes[i].getAttribute('name')]; break;
            case "star": text += lastWildCardValue; break;

            case "set": 
              if(innerNodes[i].childNodes[0].nodeValue === '*') {
                  storedVariableValues[innerNodes[i].getAttribute('name')] = wildCardArray[indexOfSetTagAmountWithWildCard];
                  indexOfSetTagAmountWithWildCard++;
              } else {
                storedVariableValues[innerNodes[i].getAttribute('name')] = innerNodes[i].childNodes[0].nodeValue;
              }
              text += resolveSpecialNodes(innerNodes[i].childNodes);
              break;

            case "sr":
              for(var j = 0; j < domArray.length; j++) {
                var result = findCorrectCategory(lastWildCardValue, domArray[j].childNodes);
                if(result) {
                  text += result;
                  break;
                }
              }
              break;

            default: text += innerNodes[i].nodeValue; break;
          }

        }
      return text;
    }

    return traverseThroughDomToFindMatchingPattern(domCategories);
}

var checkIfMessageMatchesPattern = function(userInput, patternText){
    //convert wildcards in of the pattern node into a regex that matches every char
    var regexPattern = convertWildcardToRegex(patternText);

    //add one with the text in function 'convertWildcardToRegex' here a space is added before and after the user input
    //to prevent false matching    
    if(userInput.charAt(0) != " ")
        userInput = " " + userInput;

    var lastCharacterPosition  = userInput.length - 1;
    var lastCharacter = userInput.charAt(lastCharacterPosition);
    if(lastCharacter != " ")
        userInput += " ";

    //match userInput with the regex pattern
    //if it matches, matchedString is defined
    var matchedString = userInput.toUpperCase().match(regexPattern);

    if(matchedString) {
      if (matchedString[0].length >= userInput.length || regexPattern.indexOf(aimlRegex) > -1)
      {
        //if patternText contained a wild card, get the user input that were put into this wild card
        //use original patternText (* is not replaced by regex!)
        var information = getWildCardValue(userInput, patternText);
        return true;
      }
    } else
      return false;
}

var convertWildcardToRegex = function(text) {
    var firstCharacter = text.charAt(0);

    //add a space before and after the pattern text (THIS IS LATER ALSO DONE FOR THE USER INPUT)
    //prevents false matchings
    //e.g. (HI as regex also matches HIM or HISTORY, but <space>HI</space> does only match <space>HI</space>)
    if(firstCharacter != "*")
      text = " " + text;

    var lastCharacterPosition = text.length - 1;
    var lastCharacter = text.charAt(lastCharacterPosition);

    //replace space before wildcard
    var modifiedText = text.replace(' *', '*');

    //replace wildcard (*) by regex
    modifiedText = modifiedText.replace(/\*/g, aimlRegex);

    //pattern should also match when user inputs ends with a space, ?, ! or .
    if (lastCharacter != "*")
        modifiedText = modifiedText + '[\\s|?|!|.]*';

    return modifiedText;
}

var getWildCardValue = function(userInput, patternText){

    //get all strings of the pattern that are divided by a *
    //e.g. WHAT IS THE RELATION BETWEEN * AND * -> [WHAT IS THE RELATION BETWEEN , AND ]

    var replaceArray = patternText.split('*');
    var wildCardInput = userInput;

    if(replaceArray.length > 1) {

        //replace the string of the userInput which is fixed by the pattern (case-insensitive)
        for(var i = 0; i < replaceArray.length; i++)
            wildCardInput = wildCardInput.replace(new RegExp(replaceArray[i],'i'), '|');

        //split the wildCardInput string by | to differentiate multiple * inputs
        //e.g. userInput = WHAT IS THE RELATION BETWEEN TIM AND STRUPPI?
        //-> | TIM | STRUPPI
        //-> [TIM, STRUPPI]

        wildCardInput = wildCardInput.split('|');

        //split function can create an array which also includes spaces etc. -> e.g. [TIM, " ", "", STRUPPI, " "]
        //we just want the information
        var wildCardArrayIndex = 0;

        for(var i = 0; i < wildCardInput.length; i++) {
            if(wildCardInput[i] != '' && wildCardInput[i] != ' ' && wildCardInput != undefined) {
                var wildCard = wildCardInput[i];

                // trim spaces and special characters from * content
                wildCard = wildCard.replace(/^\s+|[\s\!\.\?]+$/gm,'');

                wildCardArray[wildCardArrayIndex] = wildCard;
                wildCardArrayIndex++;

                if(!wildCardInput[i+1])
                    lastWildCardValue = wildCardArray[wildCardArrayIndex-1];
            }
        }
    }
    return wildCardArray;
}

if (typeof require != 'undefined' && require.main === module) {
  var DOMParser = require('xmldom').DOMParser;
  var aimlInterpreter = new AIMLInterpreter({name:'Nobody', age:'24'});
  var parser = new DOMParser();
  var data = require('fs').readFileSync('./russian.aiml')+'';
  var dom = parser.parseFromString(data, "application/xml");
  domArray[domIndex] = dom.childNodes[1];
  domIndex++;
  isAIMLFileLoaded = true;
  var callback = function(answer, wildCardArray) { console.log(answer + ' | ' + wildCardArray); };
  aimlInterpreter.findAnswerInLoadedAIMLFiles('Test', callback);
  //process.stdin.on('data', function (buf) { var s = require('iconv-lite').decode(buf,'cp866'); aimlInterpreter.findAnswerInLoadedAIMLFiles(s, callback); });
}
