import os
import flask
import psycopg2
import json

def database():
	host     = os.environ.get("POSTGRES_HOST")
	database = os.environ.get("POSTGRES_DATABASE")
	user     = os.environ.get("POSTGRES_USER")

	with open(os.environ.get("POSTGRES_PASSWORD_FILE"), "r") as file:
		password = file.read().replace("\n", "")

	return psycopg2.connect(
		host     = host,
		database = database,
		user     = user,
		password = password
	)

app = flask.Flask(__name__)

@app.route("/api")
def hello():
	cursor = database().cursor()
	cursor.execute("SELECT * FROM example;")
	rows = cursor.fetchall()

	return rows


@app.route("/api/cv")
def get_cv():
	with open('data/data.json') as f:
		data = json.load(f)
	return flask.jsonify(data)