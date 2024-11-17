const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bodyParser = require('body-parser');
const methodOverride = require('method-override');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('./models/user'); 
const Post = require('./models/Post'); 
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// Conexión a MongoDB
mongoose.connect('mongodb://localhost:27017/blog')
    .then(() => console.log('Conectado a MongoDB'))
    .catch(err => console.error('Error al conectar con MongoDB:', err));

// Configuración de Multer para subir archivos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// Middleware
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(methodOverride('_method'));
app.use(session({
    secret: 'mi_secreto',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 60000 * 60 }
}));

// Middleware para verificar autenticación
function isAuthenticated(req, res, next) {
    if (req.session.user) return next();
    res.redirect('/login');
}

// Rutas principales
app.get('/', async (req, res) => {
    try {
        const posts = await Post.find().populate('author').sort({ createdAt: -1 });
        const message = req.session.message;
        req.session.message = null; 
        res.render('index', { posts, user: req.session.user, message });
    } catch (error) {
        console.error('Error al obtener publicaciones:', error);
        res.render('index', { posts: [], user: req.session.user, message: { content: 'Error al cargar publicaciones.', type: 'error' } });
    }
});

app.get('/post/new', isAuthenticated, (req, res) => {
    res.render('post', { user: req.session.user, errorMessage: req.session.errorMessage });
    req.session.errorMessage = null; // Limpiar el mensaje de error
});

app.post('/post', isAuthenticated, upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    const post = new Post({
        title,
        content,
        image: req.file ? req.file.path : '',
        author: req.session.user._id
    });

    try {
        await post.save();
        req.session.message = { content: 'Publicación creada exitosamente.', type: 'success' };
        res.redirect('/');
    } catch (error) {
        req.session.errorMessage = 'Error al crear la publicación. Por favor, intenta de nuevo.';
        res.redirect('/post/new');
    }
});

// Rutas para editar y eliminar publicaciones
app.get('/post/:id/edit', isAuthenticated, async (req, res) => {
    const post = await Post.findById(req.params.id);
    if (post && post.author.equals(req.session.user._id)) {
        res.render('edit', { post, user: req.session.user });
    } else {
        req.session.message = { content: 'No tienes permiso para editar esta publicación.', type: 'error' };
        res.redirect('/');
    }
});

app.put('/post/:id', isAuthenticated, upload.single('image'), async (req, res) => {
    const { title, content } = req.body;
    const updateData = { title, content };

    if (req.file) {
        updateData.image = req.file.path;
    }

    try {
        const post = await Post.findByIdAndUpdate(req.params.id, updateData, { new: true });
        req.session.message = { content: 'Publicación actualizada exitosamente.', type: 'success' };
        res.redirect('/');
    } catch (error) {
        req.session.message = { content: 'Error al actualizar la publicación. Por favor, intenta de nuevo.', type: 'error' };
        res.redirect(`/post/${req.params.id}/edit`);
    }
});

app.delete('/post/:id', isAuthenticated, async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.id);
        req.session.message = { content: 'Publicación eliminada exitosamente.', type: 'success' };
        res.redirect('/');
    } catch (error) {
        req.session.message = { content: 'Error al eliminar la publicación. Por favor, intenta de nuevo.', type: 'error' };
        res.redirect('/');
    }
});

// Rutas para comentarios
app.post('/post/:id/comment', isAuthenticated, async (req, res) => {
    const { comment } = req.body;
    const post = await Post.findById(req.params.id);
    
    post.comments.push({ content: comment, author: req.session.user._id });
    
    try {
        await post.save();
        req.session.message = { content: 'Comentario agregado exitosamente.', type: 'success' };
        res.redirect('/');
    } catch (error) {
        req.session.message = { content: 'Error al agregar el comentario. Por favor, intenta de nuevo.', type: 'error' };
        res.redirect('/');
    }
});

// Rutas para likes y dislikes
app.post('/post/:id/like', isAuthenticated, async (req, res) => {
    const post = await Post.findById(req.params.id);
    
    if (post) {
        post.likesCount = (post.likesCount || 0) + 1;
        await post.save();
        res.json({ likesCount: post.likesCount });
    } else {
        res.status(404).send('Post no encontrado');
    }
});

app.post('/post/:id/dislike', isAuthenticated, async (req, res) => {
    const post = await Post.findById(req.params.id);
    
    if (post) {
        post.dislikesCount = (post.dislikesCount || 0) + 1;
        await post.save();
        res.json({ dislikesCount: post.dislikesCount });
    } else {
        res.status(404).send('Post no encontrado');
    }
});

// Rutas para registro y login
app.get('/register', (req, res) => {
    res.render('register', { user: req.session.user, errorMessage: req.session.errorMessage });
    req.session.errorMessage = null; 
});

app.post('/register', async (req, res) => {
    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hashedPassword });
    
    try {
        await user.save();
        req.session.user = user; 
        res.redirect('/');
    } catch (error) {
        req.session.errorMessage = 'Error al registrarse. Por favor, intenta de nuevo.';
        res.redirect('/register');
    }
});

app.get('/login', (req, res) => {
    res.render('login', { errorMessage: req.session.errorMessage });
    req.session.errorMessage = null; 
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.user = user; 
        res.redirect('/');
    } else {
        req.session.errorMessage = 'Usuario o contraseña incorrectos.';
        res.redirect('/login');
    }
});

// Ruta para cerrar sesión
app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
