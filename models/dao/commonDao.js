const model = require("../dto/index");
exports.addData = (data, schema) => {
    return new Promise(async (resolve, reject) => {
        try {
            const Schema = model[schema]; //require("../dto/" + schema);
            console.log(Schema, data)
            resolve(await Schema.create(data));
        } catch (err) {
            console.log(err, "err")
            reject(err);
        }
    });
};

exports.getAllDatabyCond = (query, schema) => {
    return new Promise(async (resolve, reject) => {
        try {
            const Schema = model[schema];
            resolve(await Schema.find(query.query, query.fields, query.options))
        } catch (error) {
            reject(error);
        }
    })
};

exports.updateByCond = async (query, data, schema) => {
    return new Promise(async (resolve, reject) => {
        try {
            let schemaModel = model[schema];
            resolve(await schemaModel.findByIdAndUpdate(query, data, { new: true }));
        } catch (error) {
            reject(error);
        }
    });
};
