<?php
if(!isset($secured)){ die('Not authorized.'); }

//** LANGUAGE **//
/*$lang=array('en','ro');
if(isset($_COOKIE['lang']) && !empty($_COOKIE['lang']) && in_array($_COOKIE['lang'],$lang)){
	$langpath=$_COOKIE['lang'];
}else{
	$langpath='en';
}
require 'include/lang/'.$langpath.'.php';*/

$accesspassword='T!m1efz[xm-h53Un'; //set this up in bot_source as well, for accessing /cost.php, /endgame.php

//** DATABASE **//
$db=array( //mysql credentials
			'host'		=>		'localhost',
			'user'		=>		'root',
			'pass'		=>		'T!m1efz[xm-h53Un',
			'name'		=>		'csgospinner',
	);

//** SITE DETAILS (URL/NAME/DESCRIPTION) **//
$site=array(
		'url'			=>			'http://betandwinskins.com/',
		'static'		=>			'http://betandwinskins.com/static', //get a subdomain static.site.com with /static/ path to host static files like css,js,images - helps with loading times
		'name'			=>			'betandwinskins',
		'sitenameinusername'	=>			'betandwinskins.com', //what people need to have in their steam name to get +5% to winnings (5% comission instead of 10)
		'description'		=>			$l->description,
		'depositlink'		=>			'https://steamcommunity.com/tradeoffer/new/?partner=417582087&token=G_fhsZl4',
		'maxitems'		=>			100, //max items in a round
		'minvalue'		=>			'0.01', // in $, float values supported. you need to edit this info in the bot_source as well.
		'maxbet'		=>			20, //max number of items a person can deposit in a round
		'gametime'		=>			90,
		'gamedbprefix'		=>			'z_round_',
	);

$adminslist=array(
		'ADMIN STEAM ID', // people that can access /admin.php while logged in
	);

header("Access-Control-Allow-Origin: ".$site['static']); //fonts from static. subdomain won't load without this

$prf=$site['gamedbprefix'];

$ccs=array( //content creators
	'steamid'=>array( //facebook template
		'type'=> 'Owner',

		'title'=> 'User',
		'desc'=>  'Owner of betandwinskins',

		//for play sidebar
		'url'=> 'http://steamcommunity.com/id/user/',
		'icon'=> 'http://i.imgur.com/ybeiyxn.png',
	),
	'steamid'=>array( //twitch template
		'type'=> 'twitch',
		'tname'=> '?',

		//
		'title'=> 'Streamer',
		'desc'=>  'Partnered with',

		//for play sidebar
		'url'=> 'http://twitch.tv/?',
		'icon'=> 'http://i.imgur.com/xup9Jyr.png',
	),
);


//dev
$allowips=array( //if you only want to allow certain ips to access the site (kinda like a developer mode), uncomment the line under this
	'127.0.0.1', //server

	);
if(!in_array($_SERVER['http_CF_CONNECTING_IP'], $allowips)){
	//die('Coming soon...');

}