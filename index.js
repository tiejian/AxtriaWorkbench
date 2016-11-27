const PythonShell = require('python-shell');
const express = require('express');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use("/", express.static(__dirname));
app.get('/', function(req, res) {
  res.sendFile(__dirname + '/index.html');
});
server.listen(3000);

// TODO: parameterize HF codes
function queryBusinessRuleA(data) {
  //const code = data['code'];
  const sql = `drop table if exists Interim1;
create table Interim1 stored as parquet as (
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
);`;
  for (let i = 0; i < sql.length; i++) {
    let line = sql[i];
    const pyshell = new PythonShell('connect.py');
    pyshell.send(line);
    pyshell.on('message', function(res) {
      //rows = JSON.parse(res);
      console.log(res);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished execution A' + i);
    });
  }
}

function queryBusinessRuleBC(data) {
  // TODO: WHere is the index_period_start and index_period_end???
  const contDays = data['contEnroll'];
  const gapDays = data['gapDays'];
  const sql = [
    'drop table if exists continuous_enroll;',
    `WITH
    lag_dates AS
    (
      select enrolid,dtstart,dtend,dobyr,sex,
      case when dtstart <= date_add(lag(dtend) over(partition by enrolid order by dtstart,dtend), ${gapDays}) then 0
      else 1
      end lag_dates_flag
      from detail_enroll_nonpar where dtstart<=years_add('2013-12-31',1) and dtend>=years_add('2012-01-01',-5)
      group by enrolid,dtstart,dtend,dobyr,sex
    ),
    subq AS
    (
      select enrolid,dtstart,dtend,dobyr,sex,sum(lag_dates_flag) over(partition by enrolid order by dtstart, dtend) lag_sum
      from lag_dates
    )
    SELECT enrolid,min(dtstart) dtstart,max(dtend) dtend,dobyr,sex
    FROM subq
    GROUP BY lag_sum,enrolid,dobyr,sex;`
  ];

  for (let i = 0; i < sql.length; i++) {
    let line = sql[i];
    const pyshell = new PythonShell('connect.py');
    pyshell.send(line);
    pyshell.on('message', function(res) {
      //rows = JSON.parse(res);
      console.log(res);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished execution BC ' + i);
    });
  }
}

function queryBusinessRuleD(data) {
  const indexDate = data['indexDate'];
  const year = indexDate.substr(0, 4);
  const sql = [
    `drop table if exists index_temp;`,
    `create table if not exists index_temp stored as parquet as(
    select enrolid,min(svcdate) as min_svcdate
    from interim1
    group by enrolid;`,

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

  for (let i = 0; i < sql.length; i++) {
    let line = sql[i];
    const pyshell = new PythonShell('connect.py');
    pyshell.send(line);
    pyshell.on('message', function(res) {
      //rows = JSON.parse(res);
      console.log(res);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished execution D ' + i);
    });
  }
}

function queryBusinessRuleE(data) {
  const adultYear = data['adultYear'];
  const sql = [
    'drop table if exists interim4',
    `create table if not exists interim4 stored as parquet as
    select a.enrolid, DX1, DX2,a.DOBYR, AGE, DX3, DX4, PLANTYP, REGION, EESTATU, a.SEX, source,index_date,prediagfn,dtstart,dtend
    from interim3 a  inner join continuous_enroll b
    on a.enrolid=b.enrolid
    where age>=${adultYear};`
  ];

  for (let i = 0; i < sql.length; i++) {
    let line = sql[i];
    const pyshell = new PythonShell('connect.py');
    pyshell.send(line);
    pyshell.on('message', function(res) {
      //rows = JSON.parse(res);
      console.log(res);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished execution E ' + i);
    });
  }
}

function queryCOHORT(data) {
  const sql = [
    `drop table if exists cohort;`,
    'create table if not exists cohort as select enrolid, index_date, age, sex, region, plantyp, eestatu, source as dataset, prediagfn from interim4 where datediff(index_date,dtstart)>=365 and index_date between dtstart and dtend;',
    `drop table if exists kick_out_cohort;`,
    `create table if not exists kick_out_cohort as select enrolid,index_date, age, sex, region, plantyp, eestatu, source as dataset, prediagfn from interim4 where datediff(index_date,dtstart)<365 OR index_date not between dtstart and dtend;`
  ];

  for (let i = 0; i < sql.length; i++) {
    let line = sql[i];
    const pyshell = new PythonShell('connect.py');
    pyshell.send(line);
    pyshell.on('message', function(res) {
      //rows = JSON.parse(res);
      console.log(res);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished execution' + i);
    });
  }
}

io.on('connection', function(socket) {
  console.log('connected');

  socket.on('query', function(data) {
    console.log(data);

    queryBusinessRuleA(data);
    queryBusinessRuleBC(data);
    queryBusinessRuleD(data);
    queryBusinessRuleE(data);
    queryCOHORT(data);

    const pyshell = new PythonShell('connect.py');
    // TODO: Remove the limit operator. This is for demo only
    pyshell.send('select * from cohort limit 25;');
    pyshell.on('message', function(res) {
      cohort = JSON.parse(res);
      socket.emit('cohort', cohort);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished fetching cohort');
    });

    /*pyshell.send('select * from kickout limit 25;');
    pyshell.on('message', function(res) {
      kickout = JSON.parse(res);
      socket.emit('kickout', kickout);
    });
    pyshell.end(function(err) {
      if (err) console.log(err);
      else console.log('finished fetching kickout');
    });*/
  });

  io.on('disconnect', function(socket) {
    console.log('disconnected');
  });



});
