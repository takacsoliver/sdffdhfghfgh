<?php
session_start();
$link = mysql_connect("localhost", "root", "T!m1efz[xm-h53Un"); // MySQL Host , Username and password
$db_selected = mysql_select_db('csgospinner', $link); // MySQL Database
mysql_query("SET NAMES utf8");

function fetchinfo($rowname,$tablename,$finder,$findervalue)
{
	if($finder == "1") $result = mysql_query("SELECT $rowname FROM $tablename");
	else $result = mysql_query("SELECT $rowname FROM $tablename WHERE `$finder`='$findervalue'");
	$row = mysql_fetch_assoc($result);
	return $row[$rowname];
}
?>