const postgres = require('./postgres')

var router = require('express').Router();

router.get('/', async (req, res) => {
    const { rows } = await postgres.query('select id,ST_AsGeoJSON(geom) as geom, nlanes,width from tranexproad order by id');
    // console.log(rows);
    rows.forEach((data) => {
        data.geom = JSON.parse(data.geom);
    });
    // console.log(rows);
    res.send(rows);
})

module.exports = router;