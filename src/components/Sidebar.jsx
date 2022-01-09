import React from "react";
import { Link } from "react-router-dom";
import styled from "styled-components";
import { Play, Stop } from "./Play.jsx";
import { randomize } from "./Browser.jsx";
import { slide as Menu } from "react-burger-menu";
import BurgerMenu from 'react-burger-menu';

const playBtnStyle = { textAlign: 'center', zIndex: 9999, position: 'absolute', left: '10em', top: '5px' };
const stopBtnStyle = { textAlign: 'center', zIndex: 9999, position: 'absolute', left: '16em', top: '5px' };

class SideNav extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      isOpen: false,
      activePath: "/",
      items: [
        // {
        //   type: "button",
        //   key: 1000,
        //   name: "play",
        //   path: "play",
        // },
        // {
        //   type: "button",
        //   key: 1001,
        //   name: "stop",
        //   path: "stop",
        // },
        {
          path: "./public/canvas/animated-scribble-curves.js",
          name: "Sigil generator",
          key: 5,
          type: "sketch",
        },
        {
          path: "./public/canvas/animated-three-sphere-shader.js",
          name: "circle colors",
          key: 8,
          type: "sketch",
        },
        {
          path: "./public/canvas/animated-three-text-canvas.js",
          name: "Cube flasher",
          key: 9,
          type: "sketch",
        },
        {
          path: "./public/canvas/animated-two-overdraw.js",
          name: "Stars",
          key: 12,
          type: "sketch",
        },
        {
          path: "./public/canvas/canvas-abstract-risograph-print.js",
          name: "Cubism",
          key: 14,
          type: "sketch",
        },
        {
          path: "./public/canvas/canvas-geometric-3d.js",
          name: "Crystal",
          key: 18,
          type: "sketch",
        },
        {
          path: "./public/canvas/church2.jpg",
          name: "Generative 1",
          key: 30,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/eye.jpg",
          name: "Generative Eye",
          key: 31,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/fractal1.jpg",
          name: "Generative 3",
          key: 32,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/fractal2.jpg",
          name: "Generative fractal",
          key: 33,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/map7.jpg",
          name: "Generative 5",
          key: 34,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/nature1.jpg",
          name: "Generative 6",
          key: 35,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/pat1.jpg",
          name: "Generative 7",
          key: 36,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/pentagram.jpg",
          name: "Generative Pentagram",
          key: 37,
          type: "color-mixer",
        },
        {
          path: "./public/canvas/snowflake.jpg",
          name: "Generative Snow",
          key: 38,
          type: "color-mixer",
        },
      ],
    };
  }  

  closeSideBar = () => {
    this.setState({ isOpen: false });
  }

  handleIsOpen = () => {
    this.setState({ isOpen: !this.state.isOpen })
  }

  onItemClick(path, type) {
    this.closeSideBar();

    var element = document.getElementsByTagName("canvas"),
      index;
    for (index = element.length - 1; index >= 0; index--) {
      if (element[index].id != "canvas") {
        element[index].parentNode.removeChild(element[index]);
      }
    }
    if (type === "sketch") {
      this.setState({ activePath: path });
      var canvasID = document.getElementById("canvas");
      canvasID.setAttribute("style", "display: none;");
      let script = document.getElementById("dynamic");
      if (script != null) {
        script.remove();
        script = document.createElement("script");
        script.setAttribute("id", "dynamic");
        script.src = path;
        script.async = true;
        document.body.appendChild(script);
      }
    } else if (type === "color-mixer") {
      var canvasID = document.getElementById("canvas");
      canvasID.setAttribute("style", "display: block;");
      // var sketchScript = document.getElementById("dynamic");
      // sketchScript.src = "";
      // var scriptDiv = document.getElementById("scriptDiv");
      // var canvastag = document.createElement("canvas");
      // canvastag.setAttribute("id", "canvas");
      // canvastag.setAttribute("class", "noselect");
      // canvastag.setAttribute("style", "position: absolute;");
      // canvastag.setAttribute("width", "2560");
      // canvastag.setAttribute("height", "1440");
      // scriptDiv.appendChild(canvastag);
      randomize(path);
    } else if (type === "button") {
      if (path === "play") {
        Play();
      } else {
        Stop();
      }
    }
  }

  getItems() {
    let items = this.state.items.map((item, index) => {
      return (
        <a 
          key={item.key} 
          href="#" 
          onClick={() => {this.onItemClick(`${item.path}`, `${item.type}`)}}
        >
          <i className="fa fa-fw fa-star-o" />
          <span>{item.name}</span>
        </a>
      );
    });

    return items;
  }

  render() {
    const { isOpen, items, activePath } = this.state;
    const Menu = BurgerMenu["bubble"];
    return (
        <div style={{ positon: 'relative' }}>          
          <Menu 
            isOpen={isOpen}
            onOpen={this.handleIsOpen}
            onClose={this.handleIsOpen}
            id="bubble"
            pageWrapId={'page-wrap'}
            outerContainerId={'outer-container'}
          >
            { this.getItems() }
          </Menu>
          <a 
            className="side-button" 
            style={playBtnStyle} 
            onClick={() => {this.onItemClick('play', 'button')}}>
            Play
          </a>
          <a 
            className="side-button" 
            style={stopBtnStyle} 
            onClick={() => {this.onItemClick('stop', 'button')}}>
            Stop
          </a>
        </div>
    );
  }
  componentDidMount() {
    let url = document.location.href;
    console.log("a:" + url);
    if (url.indexOf("leftEar") == -1) {
      document.location.href = "/play?leftEar=200&rightEar=240";
    }
    Play();
  }
}

export class Sidebar extends React.Component {
  render() {
    return <SideNav></SideNav>;
  }
}
