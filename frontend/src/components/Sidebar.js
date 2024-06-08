import './Sidebar.css';

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

const Sidebar = ({ data }) => {
	return (
		<aside className="sidebar">
			<img src={data.photo} alt="Profile" />
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
	);
};

export default Sidebar;
