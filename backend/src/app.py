import os
import typing
import datetime
import urllib.parse

import flask
import openai
import pydantic
import requests

app = flask.Flask(__name__)

with open(os.getenv("OPENAI_KEY"), "r") as file:
	openai.api_key = file.read().strip()

class Skill(pydantic.BaseModel):
	name: str
	level: int

class Experience(pydantic.BaseModel):
	title: str
	company: str
	start_month: str
	start_year: str
	end_month: str
	end_year: str
	description: str


class Education(pydantic.BaseModel):
	title: str
	institution: str
	subinstitution: str
	end_year: str
	description: str


class PersonalInfo(pydantic.BaseModel):
	title_before_name: str
	name: str
	title_after_name: str
	position: str
	phone: str
	email: str
	location: str
	photo: str
	description: str
	skills: list[Skill]
	interests: list[str]
	github: str
	linkedin: str
	experience: list[Experience]
	education: list[Education]

@app.route("/api/extract", methods=['GET'])
def extract_personal_info():
	url = flask.request.args.get('url')

	if url:
		url = urllib.parse.unquote(flask.request.args.get('url'))
		response = requests.get(url)
		if response.status_code != 200:
			return { "error": f"Failed to fetch data from url '{url}'!"}, response.status_code
		text = response.text
	else:
		with open('data/cv.md') as f:
			text = f.read()

	response = openai.beta.chat.completions.parse(
		model = "gpt-4o-mini",
		messages = [
			{"role": "system", "content": "You are an assistant that extracts personal information for a CV."},
			{"role": "user", "content": text}
		],
		response_format = PersonalInfo
	)

	return response.choices[0].message.parsed.model_dump(mode='json')