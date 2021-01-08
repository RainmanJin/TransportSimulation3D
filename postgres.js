const { Pool } = require('pg');
//数据库配置
var conString = "postgresql://postgres:ItaloFan@localhost:5432/roadnetwork"; //tcp://用户名：密码@localhost/数据库名
const pool = new Pool({
  connectionString: conString,
})

module.exports = {
  query: (text, params) => pool.query(text, params),
};