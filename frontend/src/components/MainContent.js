const MainContent = ({ data }) => {
	return (
		<main className="main-content">
			<header>
				<h1>{data.name}</h1>
				<h2>{data.position}</h2>
				<p>{data.location}</p>
				<p>{data.phone}</p>
				<p>{data.email}</p>
			</header>
			<section>
				<h2>Work Experience</h2>
				{data.experience?.map((job, index) => (
					<div key={index}>
						<h3>{job.title}</h3>
						<p>{job.company}</p>
						<p>{job.start.month}/{job.start.year} - {job.end ? `${job.end.month}/${job.end.year}` : 'Present'}</p>
						<p>{job.description}</p>
					</div>
				))}
			</section>
			<section>
				<h2>Education</h2>
				{data.education?.map((edu, index) => (
					<div key={index}>
						<h3>{edu.title}</h3>
						<p>{edu.institution}</p>
						<p>{edu.subinstitution}</p>
						<p>Graduated: {edu.end.year}</p>
						<p>{edu.description}</p>
					</div>
				))}
			</section>
		</main>
	);
};

export default MainContent;
