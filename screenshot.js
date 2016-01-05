/*jslint browser: true, white:true */
/*globals console:true, chrome:true, request:true*/
// Copyright (c) 2011 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

var app = (function () {
    "use strict";
    var config = {
        clientId : 'oKm791TFnRfVDSHQ',
        portalURL: "https://www.arcgis.com/"
    },
        model = {
            access_token: null,
            folderId: '',
            shareEveryone: false,
            shareOrg: false,
            shareGroups: false,
            username: '',
            thumbnail: null
        },
        signin_button,
        shareEveryone_button,
        shareOrg_button,
        shareGroup_buttons = [];

    var tokenFetcher = (function () {
        var clientId = 'oKm791TFnRfVDSHQ',
            access_token = null,
            redirectUri = chrome.identity.getRedirectURL('saveAGO'),
            redirectRe = new RegExp(redirectUri + '[#\\?](.*)'),
            authURL = config.portalURL + "sharing/rest/oauth2/authorize/";

        return {
            getToken: function (interactive, callback) {

            // In case we already have an access_token cached, simply return it.
                if (model.access_token) {
                    callback(null, model.access_token);
                    return;
                }

                var options = {
                    'interactive': interactive,
                    'url': authURL +
                        '?client_id=' + clientId + '&redirect_uri=' + encodeURIComponent(redirectUri) + "&response_type=token"
                };
                chrome.identity.launchWebAuthFlow(options, function (redirectUri) {
                    console.log('launchWebAuthFlow completed', chrome.runtime.lastError, redirectUri);

                    if (chrome.runtime.lastError) {
                        callback(new Error(chrome.runtime.lastError));
                        return;
                    }

                    // Upon success the response is appended to redirectUri, e.g.
                    // https://{app_id}.chromiumapp.org/provider_cb#access_token={value}
                    //     &refresh_token={value}
                    // or:
                    // https://{app_id}.chromiumapp.org/provider_cb#code={value}
                    var matches = redirectUri.match(redirectRe);
                    if (matches && matches.length > 1) {
                        handleProviderResponse(parseRedirectFragment(matches[1]));
                    } else {
                        callback(new Error('Invalid redirect URI'));
                    }

                });

                function parseRedirectFragment(fragment) {
                    var pairs = fragment.split(/&/),
                        values = {};

                    pairs.forEach(function (pair) {
                        var nameval = pair.split(new RegExp('='));
                        values[nameval[0]] = nameval[1];
                    });
                    return values;
                }

                function handleProviderResponse(values) {
                    console.log('providerResponse', values);
                    if (values.hasOwnProperty('access_token') && values.hasOwnProperty('username')) {
                        setModel(values);
                    } else {
                        callback(new Error('access_token or username avialable.'));
                    }
                }

                function setModel(values) {
                    model.access_token = values.access_token;
                    model.username = values.username;
                    console.log('Setting access_token: ', model.access_token);
                    callback(null, model.access_token);
                }
            },

            removeCachedToken: function (token_to_remove) {
                if (model.access_token === token_to_remove) {
                    model.access_token = null;
                }
            }
        };
    })();
/*
    function xhrWithAuth(method, url, interactive, callback) {
        var retry = true,
            access_token;

        console.log('xhrWithAuth', method, url, interactive);
        getToken();

        function getToken() {
            tokenFetcher.getToken(interactive, function (error, token) {
                console.log('token fetch', error, token);
                if (error) {
                    callback(error);
                    return;
                }

                access_token = token;
                requestStart();
            });
        }

        function requestStart() {
            var xhr = new XMLHttpRequest();
            xhr.open(method, url);
            xhr.setRequestHeader('Authorization', 'Bearer ' + access_token);
            xhr.onload = requestComplete;
            xhr.send();
        }

        function requestComplete() {
            //console.log('requestComplete', this.status, this.response);
            if ((this.status < 200 || this.status >= 300) && retry) {
                retry = false;
                tokenFetcher.removeCachedToken(access_token);
                access_token = null;
                getToken();
            } else {
                callback(null, this.status, this.response);
            }
        }
    }
*/
    function standardParameters () {
        return "f=json&token=" + model.access_token;
    }

    function standardError() {
        console.log('Error');
    }

    function getUserInfo(interactive) {
        var request = new XMLHttpRequest(),
            url = config.portalURL + "sharing/rest/community/users/" + model.username + "?" + standardParameters();
        console.log(url);
        request.open('GET', url, true);
        request.onload = function() {
            if ((request.status >= 200 && request.status < 400)) {
                onUserInfoFetched(null, request.status, request.response);
            } else {
                standardError();
            }
        };
        request.onerror = standardError;
        request.send();

//        xhrWithAuth('GET',
//                   config.portalURL + "sharing/rest/community/users/" + model.username,
//                   interactive,
//                   onUserInfoFetched);
    }

  // Functions updating the User Interface:

  function showButton(button) {
    button.style.display = 'inline';
    button.disabled = false;
  }

  function hideButton(button) {
    button.style.display = 'none';
  }

  function disableButton(button) {
    button.disabled = true;
  }

  function onUserInfoFetched(error, status, response) {
    if (!error && status === 200) {
      //console.log("Got the following user info: " + response);
      var user_info = JSON.parse(response);

        //Get sharing priveleges
        var p;
        console.log(user_info);
        for (p = 0; p < user_info.privileges.length; p++) {
            if (user_info.privileges[p] === "portal:user:shareToGroup") {
                model.shareGroups = true;
                populateGroups(user_info.groups);
            } else if (user_info.privileges[p] === "portal:user:shareToOrg") {
                model.shareOrg = true;
            } else if (user_info.privileges[p] === "portal:user:shareToPublic") {
                model.shareEveryone = true;
            }
        }
//      populateUserInfo(user_info);
        hideButton(signin_button);
        enableForm();
        toggleElement('shareEveryone', model.shareEveryone);
        toggleElement('shareOrg', model.shareOrg);
        toggleElement('groupList', model.shareGroups);
        getUserContentList();
        document.getElementById('submitBtn').disabled = false;
//      showButton(revoke_button);
//      fetchUserRepos(user_info["repos_url"]);
    } else {
      console.log('infoFetch failed', error, status);
      showButton(signin_button);
    }
  }

    function populateGroups(groups) {
        var gl = document.getElementById('groupList'),
            g;
        for (g = 0; g < groups.length; g++) {
            var cb = document.createElement('div');
            cb.className = 'checkbox';
            cb.innerHTML = "<label><input class='groupCHK' type='checkbox' data-id='" + groups[g].id + "'>" +  groups[g].title + "</label>";
            gl.appendChild(cb);
        }
    }

    function enableForm() {
        document.getElementById("title").removeAttribute('disabled');
        document.getElementById("desc").removeAttribute('disabled');
        document.getElementById("tags").removeAttribute('disabled');
        document.getElementById("folder").removeAttribute('disabled');
        document.getElementById("shareEveryoneCHK").removeAttribute('disabled');
        document.getElementById("shareOrgCHK").removeAttribute('disabled');
    }

    function getUserContentList(){
        var request = new XMLHttpRequest(),
            url = config.portalURL + "sharing/rest/content/users/" + model.username + "?" + standardParameters();
        request.open('GET', url, true);
        request.onload = function() {
            if ((request.status >= 200 && request.status < 400)) {
                var data = JSON.parse(request.response),
                    fl = document.getElementById('folder'),
                    f,
                    folderOption;
                folderOption = document.createElement('option');
                folderOption.value = '';
                folderOption.innerHTML = "Root Folder";
                fl.appendChild(folderOption);
                for (f=0; f < data.folders.length; f++) {
                    var thisOption = document.createElement('option');
                    thisOption.value = data.folders[f].id;
                    thisOption.innerHTML = data.folders[f].title;
                    fl.appendChild(thisOption);
                }
               } else {
                standardError();
            }
        };
        request.onerror = standardError;
        request.send();
    }

    function addItem() {
        var submitData = new FormData(),
            folderId,
            postUrl,
            request;

        submitData.append('submmting', 'hello');
        submitData.append('title', document.getElementById('title').value);
        submitData.append('url', document.getElementById('itemURL').value);
        submitData.append('description', document.getElementById('desc').value);
        submitData.append('tags', document.getElementById('tags').value);
        submitData.append('type', "Web Mapping Application");
        submitData.append('thumbnail', model.thumbnail, "thumbnail.jpg");

        model.folderId = document.getElementById('folder').value;

        postUrl = config.portalURL + "sharing/rest/content/users/" + model.username + "/";
        if (model.folderId !== '') {
            postUrl = postUrl + model.folderId + "/";
        }
        postUrl = postUrl + "addItem" + "?" + standardParameters();

        request = new XMLHttpRequest();
        request.open("POST", postUrl, true);
        request.onload = function () {
            console.log('Posted?');
            console.log(request);
            var response = JSON.parse(request.response);
            console.log(response.success);
            if (response.success) {
                shareItem(response.id);
            }
        };
        request.send(submitData);

    }

    function shareItem(id) {
        var postUrl = config.portalURL + '/sharing/rest/content/users/' + model.username,
            shareGroups = document.querySelectorAll('.groupCHK'),
            trueGroups = [],
            groupList = '',
            sharingObj = {},
            sharingText = '',
            request, g;
        console.log(shareGroup_buttons);
        for (g = 0; g < shareGroups.length; g++) {
            if (shareGroups[g].checked) {
                trueGroups.push(shareGroups[g].getAttribute('data-id'));
            }
        }
        sharingText = '&everyone=' + shareEveryone_button.checked.toString();
        sharingText += '&org' + shareOrg_button.checked.toString();
        if (trueGroups.length > 0) {
            sharingText += "&groups=" + trueGroups.join(',');
        }
         if (model.folderId !== '') {
            postUrl = postUrl + model.folderId + "/";
        }
        postUrl = postUrl + "/items/" + id + "/share?" + standardParameters() + sharingText;

        request = new XMLHttpRequest();
        request.open("POST", postUrl, true);
        request.onload = function () {
            alert('Item Shared');
            window.close();
        };
        request.send();

    }

    function toggleElement(element, bool) {
        console.log(element);
        var el = document.getElementById(element);
        el.style.display = (bool) ? '' : 'none';
    }

  // Handlers for the buttons's onclick events.

  function interactiveSignIn() {
      disableButton(signin_button);
      tokenFetcher.getToken(true, function(error, access_token) {
          if (error) {
              showButton(signin_button);
          } else {
              getUserInfo(true);
              console.log(access_token);
      }
    });
  }

  function revokeToken() {
    // We are opening the web page that allows user to revoke their token.
    window.open('https://github.com/settings/applications');
    // And then clear the user interface, showing the Sign in button only.
    // If the user revokes the app authorization, they will be prompted to log
    // in again. If the user dismissed the page they were presented with,
    // Sign in button will simply sign them in.
    user_info_div.textContent = '';
    hideButton(revoke_button);
    showButton(signin_button);
  }

  return {
    onload: function () {
      signin_button = document.querySelector('#signin');
      signin_button.onclick = interactiveSignIn;
        document.getElementById('submitBtn').onclick = addItem;
        shareEveryone_button = document.querySelector('#shareEveryoneCHK');
        shareOrg_button = document.querySelector('#shareOrgCHK');
      showButton(signin_button);
    },
      setThumbnail: function(tb) {
          model.thumbnail = tb;
      }
  };
})();

window.onload = app.onload;

function layout(layoutObj) {
    "use strict";
    console.log(layoutObj);
    document.getElementById('title').value = layoutObj.title;
    document.getElementById('itemURL').value = layoutObj.url;
}
function setScreenshotUrl(url) {
    "use strict";
    var canvas = document.createElement('canvas'),
        ctx = canvas.getContext('2d'),
        imageObj = new Image(),
        newURL;
    imageObj.onload = resizeImage;
    imageObj.src = url;

    function resizeImage() {
        canvas.width = 200;
        canvas.height = 133;
        ctx.drawImage(imageObj, 0, 0, 200, 133);
        canvas.toBlob(function(bl){
            app.setThumbnail(bl);
        },'image/jpeg',1);
        newURL = canvas.toDataURL('image/jpeg', 1);
        document.getElementById('target').src = newURL;
    }
}
