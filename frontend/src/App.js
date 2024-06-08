import React, { useEffect, useState } from 'react';
import Sidebar from './components/Sidebar';
import MainContent from './components/MainContent';
import './App.css';

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
			<Sidebar data={data} />
			<MainContent data={data} />
		</div>
	);
}

export default App;
