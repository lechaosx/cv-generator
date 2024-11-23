import os
import urllib 
import json

import flask
import redis
import openai
import pydantic
import requests

app = flask.Flask(__name__)

with open(os.getenv("OPENAI_KEY"), "r") as file:
	openai.api_key = file.read().strip()

class Experience(pydantic.BaseModel):
	title: str             = pydantic.Field(description="Job title.")
	company: str           = pydantic.Field(description="Company full legal name.")
	start_month: str       = pydantic.Field(description="Starting month of employment. Use two decimal places, like 01 or 12.")
	start_year: str        = pydantic.Field(description="Starting year of employment.")
	end_month: str         = pydantic.Field(description="Ending month of employment. Use two decimal places, like 01 or 12. Make it empty string when not known.")
	end_year: str          = pydantic.Field(description="Ending year of employment. Make it empty string when not known.")
	description: list[str] = pydantic.Field(description="Description of the job responsibilities and achievements. When not available or is too short, create a description from the input.")
	badges: list[str]      = pydantic.Field(description="Skills and technologies assocated with the position.")

class Education(pydantic.BaseModel):
	title: str          = pydantic.Field(description="Degree title. Use wordy name, like 'Master's Degree' or such.")
	institution: str    = pydantic.Field(description="Institution name, full university name.")
	subinstitution: str = pydantic.Field(description="Sub-institution, faculty or department, if applicable.")
	end_year: str       = pydantic.Field(description="Year of graduation. Make it empty string when not known.")
	description: str    = pydantic.Field(description="Description of studies or achievements. When not available or is too short, try to come up with something from the data.")

class PersonalInfo(pydantic.BaseModel):
	title_before_name: str       = pydantic.Field(description="Title before the person's name (Ing., Bc.). Leave empty when not available.")
	name: str                    = pydantic.Field(description="Full name of the person.")
	title_after_name: str        = pydantic.Field(description="Title after the person's name (PhD). Leave empty when not available.")
	position: str                = pydantic.Field(description="Current job position. Leave empty if not known.")
	phone: str                   = pydantic.Field(description="Contact phone number.")
	email: str                   = pydantic.Field(description="Email address.")
	location: str                = pydantic.Field(description="Current location (city, state).")
	photo: str                   = pydantic.Field(description="URL of the profile photo.")
	description: str             = pydantic.Field(description="A brief personal description or bio. Make something up if not directly available.")
	interests: list[str]         = pydantic.Field(description="List of personal interests or hobbies.")
	github: str                  = pydantic.Field(description="GitHub profile URL without the http/https prefix.")
	linkedin: str                = pydantic.Field(description="LinkedIn profile URL without the http/https prefix.")
	experience: list[Experience] = pydantic.Field(description="List of work experiences.")
	education: list[Education]   = pydantic.Field(description="List of educational qualifications.")

@app.route("/api/extract", methods=['GET'])
def extract_personal_info():

	refresh = 'refresh' in flask.request.args

	url = flask.request.args.get('url')

	if not url:
		return { "error": f"Url was not specified!"}, 400

	url = urllib.parse.unquote(flask.request.args.get('url'))

	redis_client = redis.StrictRedis(host='redis', port=6379, db=0, decode_responses=True)

	if not refresh:
		cached_response = redis_client.get(url)
		if cached_response:
			return cached_response, 200

	response = requests.get(url)
	if response.status_code != 200:
		return { "error": f"Failed to fetch data from url '{url}'!"}, response.status_code

	response = openai.beta.chat.completions.parse(
		model = "gpt-4o-mini",
		messages = [
			{"role": "system", "content": "You are an assistant that extracts personal information for a CV."},
			{"role": "user", "content": response.text}
		],
		response_format = PersonalInfo
	)

	response_data = response.choices[0].message.parsed.model_dump(mode='json')

	redis_client.set(url, json.dumps(response_data), ex=60 * 60 * 24 * 7)

	return response_data