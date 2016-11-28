import sys, json, datetime
from impala.dbapi import connect
conn = connect(host='54.71.106.109', port=21050)
cur = conn.cursor()
cur.execute('use axtria_cornell')

lines = sys.stdin.readlines()
for sql in lines:
	#print sql
	try:
		cur.execute(sql)
	except Exception as e:
		pass
	# stdout will be received by the server
	words = sql.split(' ')
	if words[0] == 'select' or words[0] == 'SELECT':
		res = []
		for row in cur:
			line = list(row)
			for i in range(0, len(line)):
				if isinstance(line[i], datetime.datetime):
					line[i] = str(line[i])
			row = tuple(line)
			res.append(row)
		print json.dumps(res)
