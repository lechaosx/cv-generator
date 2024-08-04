import React, { useEffect, useState } from 'react';
import './App.css';

const ProgressBar = ({ percentage }) => (
	<div className="progress-bar">
		<div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
	</div>
);

const Skill = ({ name, percentage }) => (
	<p className="skill">
		{name}
		<ProgressBar percentage={percentage}/>
	</p>
);

const Detail = ({name, value}) => (
	<div className="detail">
		<strong>{name}</strong>
		{value}
	</div>
);

const TimelineEntry = ({ children }) => {
	const childArray = React.Children.toArray(children);

	if (childArray.length !== 4) {
		throw new Error('TimelineEntry expects exactly 4 children.');
	}

	const [first, second, third, fourth] = childArray;

	return (
		<>
			<div className="left">
				<strong>{first}</strong>
				<div>{second}</div>
			</div>
			<div className="right">
				<strong>{third}</strong>
				<p>{fourth}</p>
			</div>
		</>
	);
};

const Timeline = ({ children }) => (
	<div className="timeline">
		{children}
	</div>
);

const CvSection = ({ title, children }) => (
	<section>
		<h3 className="section-header">{title}</h3>
		<div className="section-content">
			{children}
		</div>
	</section>
)

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
				<img src={data.photo} alt="Profile" width="400"/>
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
			<aside>
				<CvSection title="About Me">
					<p>{data.description}</p>
				</CvSection>
				<CvSection title="Personal Details">
					<Detail name="Birth" value={`${data.birth?.month}/${data.birth?.year}`}/>
					<Detail name="Nationality" value={data.nationality}/>
					<Detail name="Marital status" value={data.status}/>
				</CvSection>
				<CvSection title="Skills">
					{data.skills?.map(skill => (<Skill name={skill.name} percentage={skill.level}/>))}
				</CvSection>
				<CvSection title="Interests">
					{data.interests?.join(' · ')}
				</CvSection>
				<CvSection title="Connect">
					<a href={data.github} target="_blank" rel="noopener noreferrer">GitHub</a> · <a href={data.linkedin} target="_blank" rel="noopener noreferrer">LinkedIn</a>
				</CvSection>
			</aside>
			<main>
				<CvSection title="Work Experience">
					<Timeline>
						{data.experience?.map((job) => (
							<TimelineEntry>
								{job.company}
								{`${job.start.month}/${job.start.year} - ${job.end ? `${job.end.month}/${job.end.year}` : 'present'}`}
								{job.title}
								{job.description}
							</TimelineEntry>
						))}
					</Timeline>
				</CvSection>
				<CvSection title="Education">
					<Timeline>
						{data.education?.map((edu) => (
							<TimelineEntry>
								{edu.institution}
								{<>{edu.subinstitution}<br/>{edu.end.year}</>}
								{edu.title}
								{edu.description}
							</TimelineEntry>
						))}
					</Timeline>
				</CvSection>
			</main>
		</div>
	);
}

export default App;
