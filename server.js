const PythonShell = require('python-shell');
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

function auth(req, res, next) {
  if (!req.session.username)
    res.redirect('/login');
  else next();
}

app.use(bodyParser.urlencoded({ extended: true }));
app.use(session({
  secret: 'keyboard cat',
  resave: false,
  saveUninitialized: true
}));

app.get('/', auth, function(req, res) {
  res.sendFile(__dirname + '/pages/index.html');
});
app.get('/login', function(req, res) {
  res.sendFile(__dirname + '/login.html');
});
app.post('/login', function(req, res) {
  var uid = req.body.username;
  var pwd = req.body.password;
  console.log('process uid: ' + uid + ' pwd: ' + pwd);

  const py = new PythonShell('connect.py');
  py.send(`select * from passports where username='${uid}';`);
  py.on('message', function(output) {
    if (JSON.parse(output).length && JSON.parse(output)[0][1] == pwd) {
      req.session.username = uid;
      res.redirect('/');
    }
    else res.send('invalid username or password');
  });
  py.end(function(err) {
    if (err) console.log(err);
  });
});
app.post('/signup', function(req, res) {
  var uid = req.body.username;
  var pwd = req.body.password;
  var name = req.body.firstname + ' ' + req.body.lastname;
  console.log(name + ' ' + uid + ' ' + pwd);

  const py = new PythonShell('connect.py');
  py.send(`select * from passports where username='${uid}';`);
  py.on('message', function(output) {
    if (JSON.parse(output).length > 0)
      res.send('username already exists');
    else {
      const py2 = new PythonShell('connect.py');
      py2.send(`insert into passports values ('${uid}', '${pwd}', '${name}')`);
      py2.end(function(err) {
        if (err) return;
        console.log('register complete');
        req.session.username = uid;
        res.redirect('/');
      });
    }
  });
  py.end(function(err) {
    if (err) return;
  });
});
app.get('/logout', function(req, res) {
  console.log('logout triggered');
  delete req.session.username;
  res.redirect('/login');
});
app.use(express.static(__dirname + '/pages'));

server.listen(3000);

// TODO: parameterize HF codes
function queryBusinessRuleA(data) {
  //const code = data['code'];
  const lines = [
    `drop table if exists Interim1;`,
    `create table Interim1 stored as parquet as (
    (select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 's' as source
    from Interim_s
    where DX1 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 's' as source
    from Interim_s
    where DX2 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 's' as source
    from Interim_s
    where DX3 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 's' as source
    from Interim_s
    where DX4 IN (select codes from icd9_codes_nonpar where category='HF'))
    UNION
    (select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 'o' as source
    from Interim_o
    where DX1 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 'o' as source
    from Interim_o
    where DX2 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 'o' as source
    from Interim_o
    where DX3 IN (select codes from icd9_codes_nonpar where category='HF') union
    select enrolid, DX1, DX2, CAST(svcdate AS timestamp) as svcdate, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, 'o' as source
    from Interim_o
    where DX4 IN (select codes from icd9_codes_nonpar where category='HF'))
    );`
  ];

  return lines;
}

function queryBusinessRuleBC(data) {
  //var deferred = Q.defer();
  // TODO: WHere is the index_period_start and index_period_end???
  const contDays = data['contEnroll'];
  const gapDays = data['gapDays'];
  const lines = [
    `drop table if exists continuous_enroll;`,
    `CREATE TABLE IF NOT EXISTS continuous_enroll AS (
    SELECT enrolid,min(dtstart) dtstart,max(dtend) dtend,dobyr,sex
    FROM (select enrolid,dtstart,dtend,dobyr,sex,sum(lag_dates_flag) over(partition by enrolid order by dtstart, dtend) lag_sum
      FROM (select enrolid,dtstart,dtend,dobyr,sex,
      case when dtstart <= date_add(lag(dtend) over(partition by enrolid order by dtstart,dtend), ${gapDays}) then 0
      else 1
      end lag_dates_flag
      FROM detail_enroll_nonpar where dtstart<=years_add('2013-12-31',1) and dtend>=years_add('2012-01-01',-5)
      GROUP BY enrolid,dtstart,dtend,dobyr,sex) AS lag_dates)
    AS subq
    GROUP BY lag_sum,enrolid,dobyr,sex);`
  ];
  return lines;
}

function queryBusinessRuleD(data) {
  const indexDate = data['indexDate'];
  const year = indexDate.substr(0, 4);
  const lines = [
    `drop table if exists index_temp;`,
    `create table if not exists index_temp stored as parquet as(
    select enrolid,min(svcdate) as min_svcdate
    from interim1
    group by enrolid);`,

    `drop table if exists interim2;`,
    `create table if not exists interim2 stored as parquet as(
    select Interim1.enrolid, DX1, DX2, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, source,svcdate,min_svcdate
    from Interim1 inner join index_temp
    on Interim1.svcdate=index_temp.min_svcdate and Interim1.enrolid=index_temp.enrolid
    group by Interim1.enrolid, DX1, DX2, DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, source,svcdate,min_svcdate);`,

    `drop table if exists interim3;`,
    `create table if not exists interim3 stored as parquet as(
    select enrolid, DX1, DX2,DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, SEX, source,
    case when year(min_svcdate) < ${year} then '${indexDate}' else min_svcdate end as index_date,
    case when year(min_svcdate) < ${year} then 1 else 0 end as prediagfn
    from interim2);`
  ];
  return lines;
}

function queryBusinessRuleE(data) {
  const adultYear = data['adultYear'];
  const lines = [
    'drop table if exists interim4;',
    `create table if not exists interim4 stored as parquet as
    select a.enrolid, DX1, DX2,a.DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, a.SEX, source,index_date,prediagfn,dtstart,dtend
    from interim3 a  inner join continuous_enroll b
    on a.enrolid=b.enrolid
    where age>=${adultYear};`
  ];
  return lines;
}

function queryFinalResult(data) {
  const lines = [
    `drop table if exists cohort;`,
    `create table if not exists cohort as select enrolid, index_date, age, sex, region, plantyp, eestatu, source as dataset, prediagfn from interim4 where datediff(index_date,dtstart)>=365 and index_date between dtstart and dtend`,
    `drop table if exists kick_out_cohort;`,
    `create table if not exists kick_out_cohort as select enrolid,index_date, age, sex, region, plantyp, eestatu, source as dataset, prediagfn from interim4 where datediff(index_date,dtstart)<365 OR index_date not between dtstart and dtend`
  ];
  return lines;
}

io.on('connection', function(socket) {
  console.log('connected');

  socket.on('login', function(data) {
    let username = data['username'];
    let password = data['password'];

  })

  socket.on('query', function(data) {
    console.log(data);

    const lines = queryBusinessRuleA(data)
      .concat(queryBusinessRuleD(data))
      .concat(queryBusinessRuleBC(data))
      .concat(queryBusinessRuleE(data))
      .concat(queryFinalResult(data));

    var sql = '';
    for (let i = 0; i < lines.length; i++) {
      // remove all inner line breaks
      sql += lines[i].replace(/(\r\n|\n|\r)/gm, "") + "\n";
    }
    var condition = "dataset = 's' or dataset = 'o'";
    if (data['srcTable'] === 'inpatient_services_table') condition = "dataset = 's'";
    if (data['srcTable'] === 'outpatient_services_table') condition = "dataset = 'o'";

    // run queries
    const pyshell = new PythonShell('connect.py');
    pyshell.send(sql);
    pyshell.end(function(err) {
      if (err) console.log("An error occurred when running queries:\n" + err);

      // get COHORT
      var py = new PythonShell('connect.py');
      py.send(`select * from cohort where ${condition};`);
      py.on('message', function(res) {
        let cohort = JSON.parse(res);
        console.log(cohort.length);
        socket.emit('cohort', cohort);
      });
      py.end(function(err) {
        if (err) console.log(err);
        else console.log('finished fetching cohort');
      });

      // get kickout
      py = new PythonShell('connect.py');
      py.send(`select * from kick_out_cohort where ${condition};`);
      py.on('message', function(res) {
        let kickout = JSON.parse(res);
        console.log(kickout.length);
        socket.emit('kickout', kickout);
      });
      py.end(function(err) {
        if (err) console.log(err);
        else console.log('finished fetching kickout');
      });
    });

  });

  io.on('disconnect', function(socket) {
    console.log('disconnected');
  });
});
