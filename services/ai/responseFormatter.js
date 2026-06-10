function success(message, data = {}) {

    return {
        success: true,
        message,
        data
    };
}

function failure(message) {

    return {
        success: false,
        message
    };
}

module.exports = {
    success,
    failure
};