import React from 'react';
import ReactDOM from 'react-dom';
import {Play, Stop} from './components/Play.jsx';
import {Sidebar} from './components/Sidebar.jsx';
import {
	BrowserRouter as Router,
	Switch,
	Route,
	Link,
	useRouteMatch
  } from "react-router-dom";

// Main Entry point function
class App extends React.Component {
	render() {
		return (
			<Router>
				<div>
					<Sidebar>
					</Sidebar>
					<Switch>
						<Route path="/play">{Play}</Route>
						<Route path="/stop">{Stop}</Route>
					</Switch>
				</div>
			</Router>
		)
	}
}

/**
 * TODO:
 * add routing configuration
 * add redux or any other state manager
 * check out any best practises
 */

// Rendering the entire react application
ReactDOM.render(<App/>, document.getElementById('root'));