const moment = require("moment");

const utils = require("../utils.js");
const config = require("../../config.js");

const UserModel = require("../../models/user.js");
const emailApi = require("../emails/api.js");

// API FUNCTIONS
module.exports = {
    createNewUser: (username, password, callback) => {
        if (username.length < 2 || password.length > 15) {
            callback({ usernameLengthError: true });
        } else if (password.length < 8) {
            callback({ passwordLengthError: true });
        } else {
            UserModel.findOne({ username }).exec((error, user) => {
                if (error) {
                    callback({ submitError: true });
                } else if (user) {
                    callback({ alreadyExistUser: true });
                } else {
                    // create new user here
                    const authTokenString = utils.generateUniqueId(40);
                    const authTokenExpirationTimestamp =
                        moment().unix() +
                        86400 * config.userCookieExpirationLengthInDays;

                    const newUserDoc = new UserModel({
                        username,
                        password,
                        authToken: authTokenString,
                        authTokenExpiration: authTokenExpirationTimestamp,
                        created: moment().unix(),
                    });

                    newUserDoc.save((newUserError, newUser) => {
                        if (newUserError) {
                            callback({ submitError: true });
                        } else {
                            callback({
                                success: true,
                                username,
                                authToken: authTokenString,
                                authTokenExpirationTimestamp,
                            });
                        }
                    });
                }
            });
        }
    },

    loginUser: (username, password, callback) => {
        UserModel.findOne({ username }).exec((error, user) => {
            if (error) {
                callback({ submitError: true });
            } else if (!user) {
                callback({ credentialError: true });
            } else {
                user.comparePassword(password, (matchError, isMatch) => {
                    if (matchError) {
                        callback({ submitError: true });
                    } else if (!isMatch) {
                        callback({ credentialError: true });
                    } else {
                        const authTokenString = utils.generateUniqueId(40);
                        const authTokenExpirationTimestamp =
                            moment().unix() +
                            86400 * config.userCookieExpirationLengthInDays;

                        user.authToken = authTokenString;
                        user.authTokenExpiration = authTokenExpirationTimestamp;

                        user.save((saveError) => {
                            if (saveError) {
                                callback({ submitError: true });
                            } else {
                                callback({
                                    success: true,
                                    username: username,
                                    authToken: authTokenString,
                                    authTokenExpirationTimestamp: authTokenExpirationTimestamp,
                                });
                            }
                        });
                    }
                });
            }
        });
    },

    /**
     * Step 1 - Query the database for any users that match the username function parameter.
     *          If the user is not found, an unsuccessful response will be sent back to the website.
     * Step 2 - Compare the authentication token function parameter to what's stored in the database.
     *          If the tokens don't match, an unsuccessful response will be sent back to the website.
     * Step 3 - Validate that the authentication token has not expired.
     *          If the token has expired, an unsuccessful response will be sent back to the website.
     * Step 4 - If successful, return a success response to the website.
     * The response should also include the following data about the user to be used on the website:
     *          1. User's username.
     *          2. User's karma count.
     *          3. Boolean value representing whether or not the user has an email added to their account or not.
     *          4. Boolean value representing whether or not the user wants to see dead submissions and comments.
     */
    authenticateUser: (username, authToken, callback) => {
        UserModel.findOne({ username: username })
            .lean()
            .exec((err, user) => {
                if (
                    err ||
                    !user ||
                    authToken !== user.authToken ||
                    moment().unix() > user.authTokenExpiration
                ) {
                    callback({ success: false });
                } else {
                    callback({
                        success: true,
                        username: user.username,
                        karma: user.karma,
                        containsEmail: user.email ? true : false,
                        showDead: user.showDead ? true : false,
                    });
                }
            });
    },

    removeUserAuthData: (authUser, callback) => {
        UserModel.findOneAndUpdate(
            { username: authUser.username },
            { authToken: null, authTokenExpirationTimestamp: null }
        )
            .lean()
            .exec((error, user) => {
                if (error) {
                    callback({ submitError: true });
                } else if (!user) {
                    callback({ success: false });
                } else {
                    callback({ success: true });
                }
            });
    },

    /**
     * Step 1 - Query the database for a user with the given username.
     *          Return an error if the user is not found.
     *          Return an error if the user doesn't have an email added to their account.
     * Step 2 - Generate a reset password token and expiration date for the user.
     *          The reset password token will be a randomly generated string with a length of 40 characters.
     *          The expiration date will be a UNIX timestamp set to 1 hour in the future.
     * Step 3 - Save the token and expiration date to the database.
     * Step 4 - Send an email to the user with the reset password link.
     * Step 5 - Send a success response back to the website.
     */
    requestPasswordResetLink: (username, callback) => {
        UserModel.findOne({ username: username }).exec((error, user) => {
            if (error) {
                callback({ submitError: true });
            } else if (!user) {
                callback({ userNotFound: true });
            } else if (!user.email) {
                callback({ noEmailError: true });
            } else {
                const resetPasswordToken = utils.generateUniqueId(40);
                const resetPasswordTokenExpiration = moment().unix() + 3600;

                user.resetPasswordToken = resetPasswordToken;
                user.resetPasswordTokenExpiration = resetPasswordTokenExpiration;

                user.save(function (saveError) {
                    if (saveError) {
                        callback({ submitError: true });
                    } else {
                        emailApi.sendResetPasswordEmail(
                            user.username,
                            resetPasswordToken,
                            user.email,
                            (response) => {
                                if (!response.success) {
                                    callback({ submitError: true });
                                } else {
                                    callback({ success: true });
                                }
                            }
                        );
                    }
                });
            }
        });
    },

    /**
     * Step 1 - Query the database for a user with the given username.
     *          An error response will be sent back to the browser if no user is found in the database.
     * Step 2 - Validate the given reset token.
     *          Token needs to possess the following qualities:
     *          Must match the token stored in the database for the user.
     *          Must not have expired.
     * Step 3 - Validate the new password value.
     *          Must be at least 8 characters in length.
     *          An error response will be sent back to the browser if the password is not valid.
     * Step 4 - Save the new password to the database.
     *          Reset token and expiration date will also be removed from the database.
     * Step 5 - Send an email to the user notifying them that their password was changed.
     * Step 6 - Send a success response back to the website.
     */
    resetPassword: (username, newPassword, resetToken, callback) => {
        UserModel.findOne({ username: username }).exec((error, user) => {
            if (error || !user) {
                callback({ submitError: true });
            } else if (resetToken !== user.resetPasswordToken) {
                callback({ invalidTokenError: true });
            } else if (moment().unix() > user.resetPasswordTokenExpiration) {
                callback({ expiredTokenError: true });
            } else if (newPassword.length < 8) {
                callback({ passwordLengthError: true });
            } else {
                // proceed reset user password here
                user.password = newPassword;
                user.resetPasswordToken = null;
                user.resetPasswordTokenExpiration = null;

                user.save((saveError) => {
                    if (saveError) {
                        callback({ submitError: true });
                    } else {
                        if (user.email) {
                            emailApi.sendChangePasswordNotificationEmail(
                                username,
                                user.email,
                                () => {
                                    callback({ success: true });
                                }
                            );
                        } else {
                            callback({ success: true });
                        }
                    }
                });
            }
        });
    },
};
