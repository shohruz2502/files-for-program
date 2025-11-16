const express = require('express');
const { Client } = require('pg');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 3000;

// Google OAuth2 клиент
const googleClient = new OAuth2Client('1004300515131-5tsdmr87045jn4157jcsj35sqlg9913h.apps.googleusercontent.com');

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Подключение к PostgreSQL
const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/pharmacy',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Глобальная переменная для клиента БД
let db;

// Инициализация PostgreSQL
async function initializeDatabase() {
  try {
    console.log('🔄 Подключение к PostgreSQL...');
    await client.connect();
    db = client;
    console.log('✅ Успешное подключение к PostgreSQL');
    
    await createTables();
    console.log('✅ Таблицы созданы');
    
    await insertSampleData();
    console.log('✅ Тестовые данные добавлены');
    
    return db;
  } catch (err) {
    console.error('❌ Ошибка инициализации БД:', err);
    throw err;
  }
}

// Создание таблиц
async function createTables() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      image TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      old_price DECIMAL(10,2),
      image TEXT,
      category_id INTEGER REFERENCES categories(id),
      manufacturer VARCHAR(100),
      country VARCHAR(50),
      in_stock BOOLEAN DEFAULT true,
      stock_quantity INTEGER DEFAULT 0,
      is_popular BOOLEAN DEFAULT false,
      is_new BOOLEAN DEFAULT true,
      composition TEXT,
      indications TEXT,
      usage TEXT,
      contraindications TEXT,
      dosage VARCHAR(100),
      expiry_date VARCHAR(50),
      storage_conditions VARCHAR(200),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      session_id VARCHAR(255),
      user_id INTEGER,
      product_id INTEGER NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(255) UNIQUE,
      password VARCHAR(255),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      middle_name VARCHAR(100),
      phone VARCHAR(20),
      avatar TEXT,
      google_id VARCHAR(255) UNIQUE,
      is_admin BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_login TIMESTAMP,
      login_count INTEGER DEFAULT 0
    )`,
    
    `CREATE TABLE IF NOT EXISTS user_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      session_token VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      expires_at TIMESTAMP NOT NULL
    )`,
    
    `CREATE TABLE IF NOT EXISTS user_profiles (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id),
      date_of_birth VARCHAR(50),
      address TEXT,
      city VARCHAR(100),
      postal_code VARCHAR(20),
      preferences TEXT,
      newsletter BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  ];

  for (const tableSql of tables) {
    try {
      await db.query(tableSql);
    } catch (err) {
      // Игнорируем ошибки "таблица уже существует"
      if (!err.message.includes('already exists')) {
        console.error('Ошибка создания таблицы:', err);
      }
    }
  }
}

// Добавление тестовых данных
async function insertSampleData() {
  try {
    // Проверяем, есть ли уже категории
    const { rows: existingCategories } = await db.query('SELECT COUNT(*) FROM categories');
    if (parseInt(existingCategories[0].count) > 0) {
      console.log('ℹ️ Тестовые данные уже существуют');
      return;
    }

    // Добавляем категории
    const categories = [
      { name: 'Лекарства', description: 'Медицинские препараты', image: 'https://images.unsplash.com/photo-1585435557343-3b092031d5ad?w=300&h=200&fit=crop' },
      { name: 'Витамины', description: 'Витамины и БАДы', image: 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=300&h=200&fit=crop' },
      { name: 'Уход за кожей', description: 'Косметические средства', image: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=300&h=200&fit=crop' },
      { name: 'Гигиена', description: 'Средства личной гигиены', image: 'https://images.unsplash.com/photo-1583947215259-38e31be8751f?w=300&h=200&fit=crop' }
    ];

    for (const category of categories) {
      await db.query(
        'INSERT INTO categories (name, description, image) VALUES ($1, $2, $3) ON CONFLICT (name) DO NOTHING',
        [category.name, category.description, category.image]
      );
    }

    // Добавляем товары
    const products = [
      {
        name: 'Нурофен таблетки 200мг №20',
        description: 'Обезболивающее и жаропонижающее средство',
        price: 250.50,
        old_price: 280.00,
        image: 'https://images.unsplash.com/photo-1585435557343-3b092031d5ad?w=300&h=200&fit=crop',
        category_id: 1,
        manufacturer: 'Рекитт Бенкизер',
        country: 'Великобритания',
        stock_quantity: 50,
        is_popular: true,
        composition: 'Ибупрофен 200 мг',
        indications: 'Головная боль, зубная боль, мигрень',
        usage: 'По 1 таблетке 3-4 раза в день',
        contraindications: 'Язвенная болезнь, беременность'
      },
      {
        name: 'Витамин C 1000мг',
        description: 'Витамин C в таблетках для иммунитета',
        price: 450.00,
        old_price: 520.00,
        image: 'https://images.unsplash.com/photo-1550258987-190a2d41a8ba?w=300&h=200&fit=crop',
        category_id: 2,
        manufacturer: 'Solgar',
        country: 'США',
        stock_quantity: 30,
        is_popular: true,
        is_new: true
      }
    ];

    for (const product of products) {
      await db.query(
        `INSERT INTO products (
          name, description, price, old_price, image, category_id, manufacturer, country,
          stock_quantity, is_popular, is_new, composition, indications, usage, contraindications
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) ON CONFLICT DO NOTHING`,
        [
          product.name, product.description, product.price, product.old_price,
          product.image, product.category_id, product.manufacturer, product.country,
          product.stock_quantity, product.is_popular, product.is_new || true,
          product.composition, product.indications, product.usage, product.contraindications
        ]
      );
    }

    console.log('✅ Тестовые данные успешно добавлены');
  } catch (err) {
    console.log('ℹ️ Ошибка добавления тестовых данных:', err.message);
  }
}

// ==================== API ROUTES ====================

// Загрузка аватарки
app.post('/api/user/upload-avatar', async (req, res) => {
  console.log('📨 POST /api/user/upload-avatar');
  
  const { user_id, avatar } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ 
      success: false, 
      error: 'ID пользователя обязателен' 
    });
  }

  // Реализация загрузки аватарки (остается такой же)
  // ... существующий код ...
});

// Обновление профиля пользователя
app.put('/api/user/update-profile', async (req, res) => {
  console.log('📨 PUT /api/user/update-profile');
  const { user_id, first_name, last_name, middle_name, phone } = req.body;

  if (!user_id) {
    return res.status(400).json({ 
      success: false, 
      error: 'ID пользователя обязателен' 
    });
  }

  try {
    // Проверяем существование пользователя
    const { rows: users } = await db.query('SELECT * FROM users WHERE id = $1', [user_id]);
    if (users.length === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Пользователь не найден' 
      });
    }

    let updateFields = [];
    let updateValues = [];
    let paramCount = 1;

    if (first_name !== undefined) {
      updateFields.push(`first_name = $${paramCount}`);
      updateValues.push(first_name);
      paramCount++;
    }
    if (last_name !== undefined) {
      updateFields.push(`last_name = $${paramCount}`);
      updateValues.push(last_name);
      paramCount++;
    }
    if (middle_name !== undefined) {
      updateFields.push(`middle_name = $${paramCount}`);
      updateValues.push(middle_name);
      paramCount++;
    }
    if (phone !== undefined) {
      updateFields.push(`phone = $${paramCount}`);
      updateValues.push(phone);
      paramCount++;
    }

    if (updateFields.length > 0) {
      updateValues.push(user_id);
      const sql = `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramCount}`;
      
      await db.query(sql, updateValues);

      // Получаем обновленные данные
      const { rows: [updatedUser] } = await db.query('SELECT * FROM users WHERE id = $1', [user_id]);

      res.json({ 
        success: true, 
        message: 'Профиль успешно обновлен',
        user: updatedUser
      });
    } else {
      res.json({ 
        success: true, 
        message: 'Нет изменений для сохранения'
      });
    }
  } catch (err) {
    console.error('❌ Ошибка обновления профиля:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Ошибка сервера' 
    });
  }
});

// Категории
app.get('/api/categories', async (req, res) => {
  console.log('📨 GET /api/categories');
  try {
    const { rows } = await db.query('SELECT * FROM categories ORDER BY name');
    res.json(rows || []);
  } catch (err) {
    console.error('❌ Ошибка получения категорий:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Товары
app.get('/api/products', async (req, res) => {
  console.log('📨 GET /api/products');
  const { category, search, popular, new: newProducts, category_id, limit = 50, page = 1 } = req.query;
  
  let sql = `
    SELECT p.*, c.name as category_name 
    FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE 1=1
  `;
  let params = [];
  let paramCount = 1;

  if (category && category !== 'all') {
    sql += ` AND c.name = $${paramCount}`;
    params.push(category);
    paramCount++;
  }

  if (category_id) {
    sql += ` AND p.category_id = $${paramCount}`;
    params.push(parseInt(category_id));
    paramCount++;
  }

  if (search) {
    sql += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount + 1} OR p.manufacturer ILIKE $${paramCount + 2} OR c.name ILIKE $${paramCount + 3})`;
    const searchParam = `%${search}%`;
    params.push(searchParam, searchParam, searchParam, searchParam);
    paramCount += 4;
  }

  if (popular === 'true') {
    sql += " AND p.is_popular = true";
  }

  if (newProducts === 'true') {
    sql += " AND p.is_new = true";
  }

  sql += " ORDER BY p.created_at DESC";

  // Пагинация
  const offset = (parseInt(page) - 1) * parseInt(limit);
  sql += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
  params.push(parseInt(limit), offset);

  try {
    const { rows } = await db.query(sql, params);
    
    // Получаем общее количество
    let countSql = `SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
    let countParams = [];
    paramCount = 1;

    if (category && category !== 'all') {
      countSql += ` AND c.name = $${paramCount}`;
      countParams.push(category);
      paramCount++;
    }

    if (category_id) {
      countSql += ` AND p.category_id = $${paramCount}`;
      countParams.push(parseInt(category_id));
      paramCount++;
    }

    if (search) {
      countSql += ` AND (p.name ILIKE $${paramCount} OR p.description ILIKE $${paramCount + 1} OR p.manufacturer ILIKE $${paramCount + 2} OR c.name ILIKE $${paramCount + 3})`;
      const searchParam = `%${search}%`;
      countParams.push(searchParam, searchParam, searchParam, searchParam);
    }

    const { rows: countResult } = await db.query(countSql, countParams);

    res.json({ 
      success: true,
      products: rows || [],
      total: parseInt(countResult[0]?.total) || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      totalPages: Math.ceil((parseInt(countResult[0]?.total) || 0) / parseInt(limit))
    });
  } catch (err) {
    console.error('❌ Ошибка получения товаров:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Получение одного товара
app.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;
  console.log('📨 GET /api/products/' + productId);
  
  try {
    const { rows } = await db.query(`
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.id = $1
    `, [productId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Товар не найден' 
      });
    }
    
    res.json({ 
      success: true,
      product: rows[0] 
    });
  } catch (err) {
    console.error('❌ Ошибка получения товара:', err);
    res.status(500).json({ 
      success: false,
      error: err.message 
    });
  }
});

// Добавление товара через админку
app.post('/api/admin/products', async (req, res) => {
  console.log('📨 POST /api/admin/products');
  console.log('Данные товара:', req.body);

  const {
    name,
    description,
    price,
    old_price,
    image,
    category_id,
    manufacturer,
    country,
    in_stock = true,
    stock_quantity = 0,
    is_popular = false,
    is_new = true,
    composition,
    indications,
    usage,
    contraindications,
    dosage,
    expiry_date,
    storage_conditions
  } = req.body;

  if (!name || !price || !category_id) {
    return res.status(400).json({
      success: false,
      error: 'Название, цена и категория обязательны'
    });
  }

  try {
    // Проверяем существование категории
    const { rows: categories } = await db.query('SELECT * FROM categories WHERE id = $1', [category_id]);
    if (categories.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Указанная категория не существует'
      });
    }

    const sql = `
      INSERT INTO products (
        name, description, price, old_price, image, category_id, manufacturer, country,
        in_stock, stock_quantity, is_popular, is_new, composition, indications, usage,
        contraindications, dosage, expiry_date, storage_conditions
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING id
    `;

    const params = [
      name,
      description || '',
      parseFloat(price),
      old_price ? parseFloat(old_price) : null,
      image || '',
      parseInt(category_id),
      manufacturer || '',
      country || '',
      in_stock,
      parseInt(stock_quantity) || 0,
      is_popular,
      is_new,
      composition || '',
      indications || '',
      usage || '',
      contraindications || '',
      dosage || '',
      expiry_date || '',
      storage_conditions || ''
    ];

    const { rows } = await db.query(sql, params);

    console.log('✅ Товар успешно добавлен, ID:', rows[0].id);
    
    res.json({
      success: true,
      message: 'Товар успешно добавлен',
      product_id: rows[0].id
    });
  } catch (err) {
    console.error('❌ Ошибка добавления товара:', err);
    res.status(500).json({
      success: false,
      error: 'Ошибка добавления товара в базу данных: ' + err.message
    });
  }
});

// Регистрация
app.post('/api/auth/register', async (req, res) => {
  console.log('📨 POST /api/auth/register');
  const { first_name, last_name, username, email, password, phone } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ 
      success: false,
      error: 'Логин, email и пароль обязательны' 
    });
  }
  
  try {
    // Проверяем существующего пользователя
    const { rows: existingUsers } = await db.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2', 
      [username, email]
    );
    
    if (existingUsers.length > 0) {
      return res.status(400).json({ 
        success: false,
        error: 'Пользователь с таким логином или email уже существует' 
      });
    }
    
    // Создаем пользователя
    const { rows } = await db.query(
      `INSERT INTO users (first_name, last_name, username, email, password, phone, login_count) 
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [first_name, last_name, username, email, password, phone, 0]
    );
    
    const newUser = rows[0];
    
    // Создаем профиль
    await db.query(
      "INSERT INTO user_profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
      [newUser.id]
    );
    
    res.json({
      success: true,
      message: 'Регистрация успешна',
      user: {
        id: newUser.id,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        username: newUser.username,
        email: newUser.email,
        phone: newUser.phone,
        is_admin: newUser.is_admin,
        avatar: newUser.avatar
      }
    });
  } catch (err) {
    console.error('❌ Ошибка регистрации:', err);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка создания пользователя' 
    });
  }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
  console.log('📨 POST /api/auth/login');
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ 
      success: false,
      error: 'Логин и пароль обязательны' 
    });
  }
  
  try {
    const { rows } = await db.query(
      "SELECT * FROM users WHERE username = $1 OR email = $1", 
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ 
        success: false,
        error: 'Неверный логин или пароль' 
      });
    }
    
    const user = rows[0];
    
    if (user.password !== password) {
      return res.status(401).json({ 
        success: false,
        error: 'Неверный пароль' 
      });
    }
    
    // Обновляем информацию о входе
    await db.query(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP, login_count = login_count + 1 WHERE id = $1",
      [user.id]
    );
    
    res.json({
      success: true,
      message: 'Вход выполнен успешно',
      user: {
        id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        phone: user.phone,
        is_admin: user.is_admin,
        login_count: user.login_count,
        last_login: user.last_login
      }
    });
  } catch (err) {
    console.error('❌ Ошибка входа:', err);
    res.status(500).json({ 
      success: false,
      error: 'Ошибка сервера' 
    });
  }
});

// Корзина и другие endpoints остаются аналогичными, но с синтаксисом PostgreSQL...

// Статические страницы (остаются без изменений)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'netuDostup.html'));
});

app.get('/cart', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cart.html'));
});

app.get('/product', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'product.html'));
});

app.get('/categories', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'categories.html'));
});

app.get('/profile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'profile.html'));
});

// Health check
app.get('/health', async (req, res) => {
  try {
    const productsCount = await db.query('SELECT COUNT(*) as count FROM products');
    const categoriesCount = await db.query('SELECT COUNT(*) as count FROM categories');
    const usersCount = await db.query('SELECT COUNT(*) as count FROM users');
    
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      databases: {
        postgresql: '✅ Подключена'
      },
      tables: {
        products: parseInt(productsCount.rows[0].count),
        categories: parseInt(categoriesCount.rows[0].count),
        users: parseInt(usersCount.rows[0].count)
      }
    });
  } catch (err) {
    res.json({ 
      status: 'ERROR', 
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Запуск сервера
async function startServer() {
  try {
    await initializeDatabase();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Сервер запущен на порту ${PORT}`);
      console.log(`📍 http://localhost:${PORT}`);
      console.log(`🗄️ Используется PostgreSQL`);
      console.log(`\n📋 Доступные API endpoints:`);
      console.log(`   GET  /api/categories - Список категорий`);
      console.log(`   GET  /api/products - Список товаров`);
      console.log(`   GET  /api/products/:id - Получить товар`);
      console.log(`   POST /api/admin/products - Добавить товар (админка)`);
      console.log(`   POST /api/auth/register - Регистрация`);
      console.log(`   POST /api/auth/login - Вход`);
    });
  } catch (err) {
    console.error('❌ Не удалось запустить сервер:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Завершение работы сервера...');
  if (db) {
    await db.end();
    console.log('✅ Подключение к PostgreSQL закрыто');
  }
  process.exit(0);
});

startServer();