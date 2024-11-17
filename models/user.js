const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = function(candidatePassword) {
    return bcrypt.compareSync(candidatePassword, this.password);
};

// Middleware para encriptar la contraseña antes de guardar
userSchema.pre('save', function(next) {
    if (this.isModified('password') || this.isNew) {
        this.password = bcrypt.hashSync(this.password, bcrypt.genSaltSync(8), null);
    }
    next();
});

const User = mongoose.model('User', userSchema);

module.exports = mongoose.model('User', userSchema);