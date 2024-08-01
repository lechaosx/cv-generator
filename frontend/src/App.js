import React, { useEffect, useState } from 'react';
import './App.css';

const ProgressBar = ({ percentage }) => {
	return (
		<div className="progress-bar">
			<div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
		</div>
	);
};

const Skill = ({ name, percentage }) => {
	return (
		<div className="skill">{name}<ProgressBar percentage={percentage}/></div>
	);
};

const Detail = ({name, value}) => {
	return (
		<div className="detail">
			<b>{name}</b>
			{value}
		</div>
	);
};

function App() {
	const [data, setData] = useState('Loading...');

	useEffect(() => {
		fetch('/api/cv')
		.then(response => response.json())
		.then(data => setData(data))
		.catch(error => {
			console.error('Error fetching data:', error);
		  });
	}, []);

	if (!data) {
		return <div>Failed to fetch data...</div>;
	}

	document.title = data.name;
	document.querySelector("link[rel~='icon']").href = data.photo;

	return (
		<div className="container">
			<div>
				<img src={data.photo} alt="Profile" />
			</div>
			<header>
				<div>
					<h1>{data.name}</h1>
					<h2>{data.position}</h2>
				</div>
				<div>
					<p>{data.location}</p>
					<p>{data.phone}</p>
					<p>{data.email}</p>
				</div>
			</header>
			<aside className="sidebar">
				<section>
					<h3>About Me</h3>
					<p>{data.description}</p>
				</section>
				<section>
					<h3>Personal Details</h3>
					<Detail name="Birth" value={`${data.birth?.month}/${data.birth?.year}`}/>
					<Detail name="Nationality" value={data.nationality}/>
					<Detail name="Marital status" value={data.status}/>
				</section>
				<section>
					<h3>Skills</h3>
					{data.skills?.map(skill => (<Skill name={skill.name} percentage={skill.level}/>))}
				</section>
				<section>
					<h3>Interests</h3>
					{data.interests?.join(' · ')}
				</section>
				<section>
					<h3>Connect</h3>
					<a href={data.github} target="_blank" rel="noopener noreferrer">GitHub</a> · <a href={data.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
				</section>
			</aside>
			<main className="main-content">
				<section>
					<h3>Work Experience</h3>
					<div className="timeline">
						{data.experience?.map((job, index) => (
							<div>
								<h4>{job.title}</h4>
								<p>{job.company}</p>
								<p>{job.start.month}/{job.start.year} - {job.end ? `${job.end.month}/${job.end.year}` : 'Present'}</p>
								<p>{job.description}</p>
							</div>
						))}
					</div>
				</section>
				<section>
					<h3>Education</h3>
					{data.education?.map((edu, index) => (
						<div key={index}>
							<h4>{edu.title}</h4>
							<p>{edu.institution}</p>
							<p>{edu.subinstitution}</p>
							<p>Graduated: {edu.end.year}</p>
							<p>{edu.description}</p>
						</div>
					))}
				</section>
			</main>
		</div>
	);
}

export default App;
